const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('Ingreso permite ver y ocultar la clave sin enviarla ni modificarla',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../assets/login.js'),'utf8');
 const listeners={};
 const password={type:'password',value:'clave privada de prueba',closest(){return {insertAdjacentElement(pos,node){listeners.inserted=node;elements['showLoginPassword']=node.children[0];}};}};
 const input={value:'admin@bitacora.test'};
 const form={onsubmit:null};
 const message={textContent:''};
 const elements={loginForm:form,message,password,email:input};
 function element(tag){
   return {tag,id:'',type:'',checked:false,style:{cssText:''},
     setAttribute(){},append(...kids){this.children=kids;},
     addEventListener(name,cb){this[name]=cb;}};
 }
 const document={
   getElementById(id){return elements[id]||null;},
   createElement:element
 };
 const context={document,location:{hash:'#preserve',search:'',pathname:'/login.html',replace(){}},URLSearchParams};
 vm.runInNewContext(code,context);
 const checkbox=listeners.inserted?.children?.[0];
 assert.equal(listeners.inserted?.children?.[1]?.textContent,'Mostrar contraseña');
 assert.equal(checkbox?.id,'showLoginPassword');
 assert.equal(password.type,'password');
 checkbox.checked=true;
 checkbox.change();
 assert.equal(password.type,'text');
 assert.equal(password.value,'clave privada de prueba');
 checkbox.checked=false;
 checkbox.change();
 assert.equal(password.type,'password');
});
