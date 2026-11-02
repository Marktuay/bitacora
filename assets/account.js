(async()=>{
  const $=id=>document.getElementById(id),session=await KMAuth.require();
  $('accountEmail').textContent=session.email;
  const required=session.passwordChangeRequired===true;
  $('passwordTitle').textContent=required?'Establecé tu propia contraseña':'Cambiar contraseña';
  if(required)$('passwordHint').textContent='Antes de continuar, reemplazá tu contraseña inicial por una elegida por vos. Tus gestiones y fotos se conservan.';
  let next=new URLSearchParams(location.search).get('next')||'/reportes';
  if(!next.startsWith('/')||next.startsWith('//')||next.includes('\\')||next.startsWith('/cuenta'))next='/reportes';
  $('continueLink').href=next;$('continueLink').hidden=required;
  $('showPassword').onchange=()=>{for(const id of ['currentPassword','newPassword','confirmPassword'])$(id).type=$('showPassword').checked?'text':'password';};
  $('passwordForm').onsubmit=async e=>{
    e.preventDefault();$('passwordMessage').textContent='';
    if($('newPassword').value!==$('confirmPassword').value){$('passwordMessage').textContent='Las contraseñas no coinciden';$('confirmPassword').focus();return;}
    $('savePassword').disabled=true;
    try{
      const r=await fetch('/api/session?action=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:$('currentPassword').value,password:$('newPassword').value,confirmation:$('confirmPassword').value})});
      const data=await r.json();if(!r.ok)throw Error(data.error);
      e.target.reset();$('passwordMessage').textContent='Contraseña guardada. Ya podés continuar con tu bitácora.';
      for(const id of ['currentPassword','newPassword','confirmPassword'])$(id).type='password';
      $('continueLink').hidden=false;$('continueLink').focus();
      if(required)location.replace(next);
    }catch(err){$('passwordMessage').textContent=err.message;}
    finally{$('savePassword').disabled=false;}
  };
})().catch(e=>BITACORA.toast(e.message,'bad'));
