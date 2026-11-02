if(/(?:access_token|error_code|type=recovery)=?/.test(location.hash))location.replace('/recuperar.html'+location.hash);
const form=document.getElementById('loginForm');
const message=document.getElementById('message');

/* La pantalla Blazor publicada y la plantilla HTML original usan el mismo script.
   Insertamos el control si aún no existe para que el arreglo funcione sin recompilar Razor. */
const passwordField=document.getElementById('password');
if(passwordField&&!document.getElementById('showLoginPassword')){
  const label=document.createElement('label');
  label.setAttribute('for','showLoginPassword');
  label.style.cssText='display:flex;align-items:center;gap:9px;margin-top:10px;cursor:pointer;';
  const checkbox=document.createElement('input');
  checkbox.id='showLoginPassword';checkbox.type='checkbox';
  checkbox.style.cssText='width:auto;min-width:18px;min-height:18px;';
  const span=document.createElement('span');span.textContent='Mostrar contraseña';
  label.append(checkbox,span);
  passwordField.closest('.field')?.insertAdjacentElement('afterend',label);
}
const showLoginPassword=document.getElementById('showLoginPassword');
if(showLoginPassword&&passwordField){
  showLoginPassword.addEventListener('change',()=>{
    passwordField.type=showLoginPassword.checked?'text':'password';
  });
}


function nextPath(){
  let next=new URLSearchParams(location.search).get('next')||'/reportes';
  if(!next.startsWith('/')||next.startsWith('//')||next.includes('\\\\'))next='/reportes';
  return next;
}

async function resumeSession(){
  const button=form.querySelector('button');
  button.disabled=true;
  try{
    const r=await fetch('/api/session',{method:'GET',cache:'no-store'});
    if(r.ok){
      const session=await r.json();
      location.replace(session.passwordChangeRequired?'/cuenta.html?next='+encodeURIComponent(nextPath()):nextPath());
      return true;
    }
  }catch{}
  button.disabled=false;
  return false;
}

form.onsubmit=async e=>{
  e.preventDefault();
  const button=e.target.querySelector('button');
  button.disabled=true;
  message.textContent='';
  try{
    const r=await fetch('/api/session?action=login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        email:document.getElementById('email').value,
        password:document.getElementById('password').value
      })
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(data.error||`El servidor respondió con error ${r.status}. Revisá la conexión o contactá a Informática.`);
    location.replace(data.passwordChangeRequired?'/cuenta.html?next='+encodeURIComponent(nextPath()):nextPath());
  }catch(e){
    message.textContent=e instanceof TypeError?'No se pudo conectar con el servidor de la Bitácora. Revisá que la PC y el enlace HTTPS estén funcionando.':e.message;
  }finally{
    button.disabled=false;
  }
};

if(!location.hash)resumeSession();
