(()=>{
 const $=id=>document.getElementById(id),msg=text=>$('recoveryMessage').textContent=text;
 async function post(action,body){const r=await fetch('/api/session?action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
 async function verify(body){msg('Verificando enlace…');try{const data=await post('recovery',body);$('recoverForm').hidden=true;$('codeForm').hidden=true;$('resetForm').hidden=false;$('resetEmail').textContent=data.email;msg('Elegí una nueva contraseña de 8 a 128 caracteres.');$('resetPassword').focus();}catch(e){msg('El enlace o código no es válido o venció. Solicitá uno nuevo.');}}
 $('recoverForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const data=await post('recover',{email:$('recoveryEmail').value});msg(data.message);$('codeForm').hidden=false;}catch(err){msg(err.message);}finally{button.disabled=false;}};
 $('codeForm').onsubmit=async e=>{e.preventDefault();await verify({email:$('recoveryEmail').value,code:$('recoveryCode').value});};
 $('showResetPassword').onchange=()=>{for(const id of ['resetPassword','resetConfirmation'])$(id).type=$('showResetPassword').checked?'text':'password';};
 $('resetForm').onsubmit=async e=>{e.preventDefault();if($('resetPassword').value!==$('resetConfirmation').value){msg('Las contraseñas no coinciden');return;}const button=e.target.querySelector('button');button.disabled=true;try{await post('password',{password:$('resetPassword').value,confirmation:$('resetConfirmation').value,recovery:true});e.target.reset();$('resetForm').hidden=true;msg('Contraseña guardada. Ya podés volver a la aplicación e ingresar con tu nueva contraseña.');$('recoveryLogin').textContent='Continuar';$('recoveryLogin').focus();}catch(err){msg(err.message);}finally{button.disabled=false;}};
 const hash=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search);
 $('recoveryLogin').href=query.get('mobile')==='1'?'/login.html?next=%2Fmobile-auth.html':'/login.html?next=%2Freportes';
 history.replaceState(null,'',location.pathname);
 if(query.get('token_hash'))verify({tokenHash:query.get('token_hash')});
 else if(hash.get('access_token')&&hash.get('refresh_token'))verify({accessToken:hash.get('access_token'),refreshToken:hash.get('refresh_token')});
 else if(hash.get('error')||query.get('error'))msg('El enlace venció o ya fue utilizado. Solicitá uno nuevo.');
})();
