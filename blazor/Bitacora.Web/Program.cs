using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using Bitacora.Web.Components;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRazorComponents();
builder.Services.AddSingleton<EngineProcess>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<EngineProcess>());
builder.Services.AddHttpClient("engine", c => c.Timeout = TimeSpan.FromMinutes(2))
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false });
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 5 * 1024 * 1024);
var app = builder.Build();
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    // Share only the site origin with map tile providers, never a GPS path or query.
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    if (ctx.Request.Path.StartsWithSegments("/api") || ctx.Request.Path.StartsWithSegments("/evidence"))
        ctx.Response.Headers.CacheControl = "no-store";
    await next();
});
app.UseStaticFiles();
app.UseAntiforgery();
app.MapMethods("/api/{**route}", ["GET", "POST", "PATCH", "DELETE", "PUT", "HEAD", "OPTIONS"], Proxy);
app.MapMethods("/evidence/{**route}", ["GET", "HEAD"], Proxy);
app.MapRazorComponents<App>();
app.Run();

static async Task Proxy(HttpContext context, EngineProcess engine, IHttpClientFactory clients)
{
    try
    {
        if (!engine.Ready) { context.Response.StatusCode = 503; await context.Response.WriteAsJsonAsync(new { error = "El servicio está iniciando. Intentá nuevamente." }); return; }
        using var message = new HttpRequestMessage(new HttpMethod(context.Request.Method), engine.BaseUrl + context.Request.Path + context.Request.QueryString);
        if (context.Request.ContentLength > 0 || context.Request.Headers.ContainsKey("Transfer-Encoding"))
            message.Content = new StreamContent(context.Request.Body);
        string[] excluded = ["Connection", "Transfer-Encoding", "Content-Length", "X-Engine-Secret", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Forwarded-For"];
        foreach (var h in context.Request.Headers)
        {
            if (excluded.Contains(h.Key, StringComparer.OrdinalIgnoreCase)) continue;
            if (!message.Headers.TryAddWithoutValidation(h.Key, h.Value.ToArray())) message.Content?.Headers.TryAddWithoutValidation(h.Key, h.Value.ToArray());
        }
        message.Headers.Add("X-Engine-Secret", engine.Secret);
        // The original Host and Origin are preserved for the existing CSRF checks.
        using var response = await clients.CreateClient("engine").SendAsync(message, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
        context.Response.StatusCode = (int)response.StatusCode;
        foreach (var h in response.Headers.Concat(response.Content.Headers))
            if (!h.Key.Equals("transfer-encoding", StringComparison.OrdinalIgnoreCase) && !h.Key.Equals("connection", StringComparison.OrdinalIgnoreCase)) context.Response.Headers[h.Key] = h.Value.ToArray();
        await response.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
    catch (Exception ex)
    {
        context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("EngineProxy").LogError(ex, "Servicio local no disponible");
        if (!context.Response.HasStarted) { context.Response.StatusCode = 503; await context.Response.WriteAsJsonAsync(new { error = "Servicio local no disponible. Los datos pendientes deben conservarse." }); }
    }
}

public sealed class EngineProcess(IWebHostEnvironment environment, ILogger<EngineProcess> logger, IHostApplicationLifetime lifetime) : IHostedService, IDisposable
{
    private Process? process;
    private volatile bool startedReady;
    private volatile bool stopping;
    public string Secret { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    public string BaseUrl { get; private set; } = "";
    public bool Ready => startedReady && process is { HasExited: false };
    public async Task StartAsync(CancellationToken token)
    {
        var root = Path.Combine(AppContext.BaseDirectory, "Engine");
        if (!File.Exists(Path.Combine(root, "server.cjs"))) root = Path.GetFullPath(Path.Combine(environment.ContentRootPath, "..", "EngineRuntime"));
        if (!File.Exists(Path.Combine(root, "server.cjs"))) throw new InvalidOperationException("Ejecutá node blazor/prepare.mjs antes de compilar.");
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        BaseUrl = $"http://127.0.0.1:{port}";
        var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("BITACORA_NODE") ?? "node")
        {
            WorkingDirectory = root, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true
        };
        start.ArgumentList.Add("server.cjs");
        start.Environment["LOCAL_API_SECRET"] = Secret;
        start.Environment["LOCAL_API_PORT"] = port.ToString();
        var privatePath = Environment.GetEnvironmentVariable("BITACORA_DATA_DIR") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NewCentury", "BitacoraKM");
        start.Environment["BITACORA_DATA_DIR"] = Path.GetFullPath(privatePath);
        var signal = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        process = new Process { StartInfo = start, EnableRaisingEvents = true };
        process.OutputDataReceived += (_, e) => { if (e.Data == "BITACORA_ENGINE_READY") signal.TrySetResult(); else if (e.Data is not null) logger.LogInformation("{EngineMessage}", e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) logger.LogError("{EngineMessage}", e.Data); };
        process.Exited += (_, _) =>
        {
            signal.TrySetException(new InvalidOperationException("El motor local se detuvo. Revisá configuración y registro."));
            if (startedReady && !stopping) { logger.LogCritical("El motor local se detuvo. Se cierra el host para permitir su reinicio."); Environment.ExitCode = 1; lifetime.StopApplication(); }
        };
        process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine();
        await signal.Task.WaitAsync(TimeSpan.FromSeconds(45), token);
        startedReady = true;
    }
    public async Task StopAsync(CancellationToken token)
    {
        stopping = true;
        if (process is { HasExited: false }) { process.Kill(entireProcessTree: true); await process.WaitForExitAsync(token); }
    }
    public void Dispose() => process?.Dispose();
}
