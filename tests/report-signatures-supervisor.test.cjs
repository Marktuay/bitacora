const {test}=require('node:test'),assert=require('node:assert/strict');
const {reportSignatures}=require('../lib/report-signatures'),U=require('../lib/accounts');
const old=U.users;
function person(email,role,name,companies=[],areas=[]){
 return {email,app_metadata:{bitacora_role:role,bitacora_manager_name:name,bitacora_managed_companies:companies,bitacora_managed_areas:areas}};
}
test('Auditoría de New Century firma con su administrador, sin registrarlo como jefe',async t=>{
 U.users=async()=>[person('auditor-general@newcenturyni.com','admin','Jorge Mayorga')];
 t.after(()=>{U.users=old});
 const r=await reportSignatures({slug:'newcentury'},{id:'a1',name:'Auditor Uno',area:'AUDITORÍA'});
 assert.deepEqual(r,{elaboratedBy:'Auditor Uno',reviewedBy:'Jorge Mayorga'});
});
test('Ambos registros de Enrique utilizan la misma jefatura de Recursos Humanos',async t=>{
 U.users=async()=>[person('jeferecursoshumanos@newcenturyni.com','manager','Anielka Gudiel',['newcentury'],['RECURSOS HUMANOS'])];
 t.after(()=>{U.users=old});
 for(const id of ['NEW-af0907f6d8ce4a27b814996ea54ee5e6','NEW-50375b8faf78456db26795a2d5191e3c']){
  const r=await reportSignatures({slug:'newcentury'},{id,name:'Enrique Sanchez',area:'RECURSOS HUMANOS'});
  assert.deepEqual(r,{elaboratedBy:'Enrique Sanchez',reviewedBy:'Anielka Gudiel'});
 }
});
