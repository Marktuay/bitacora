import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot = path.join(root,'public');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.webmanifest':'application/manifest+json'};
const routes = {'/':'/index.html','/blokon':'/form.html','/conaser':'/form.html','/security':'/form.html','/newcentury':'/form.html','/auditoria':'/auditoria.html','/reportes':'/reportes.html','/android':'/android.html'};
const apis = new Set(['catalog','entries','health','latest','report','report-xlsx','report-pdf','support','traccar','session','access','team']);
http.createServer(async(req,res)=>{
 try {
  const url = new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
   const name=url.pathname.slice(5);
   if(!apis.has(name)){res.writeHead(404);return res.end('Not found');}
   return await require(path.join(root,'api',name+'.js'))(req,res);
  }
  const relative = routes[url.pathname] || url.pathname;
  const fp=path.resolve(publicRoot,'.'+relative);
  if(!fp.startsWith(publicRoot+path.sep)||!fs.existsSync(fp)||!fs.statSync(fp).isFile()){res.writeHead(404);return res.end('Not found');}
  res.setHeader('content-type',mime[path.extname(fp)]||'application/octet-stream');
  fs.createReadStream(fp).pipe(res);
 }catch(error){console.error(error);res.writeHead(500);res.end('Server error');}
}).listen(process.env.PORT||4173,'0.0.0.0',()=>console.log(`Bitácora KM http://localhost:${process.env.PORT||4173}`));
