import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
await rm('public',{recursive:true,force:true});
await mkdir('public',{recursive:true});
for (const file of ['index.html','cuenta.html','recuperar.html','form.html','auditoria.html','reportes.html','android.html','login.html','mobile-auth.html','accesos.html','recorrido.html','colaboradores.html','jefes.html','manifest.webmanifest','sw.js']) await copyFile(file,`public/${file}`);
await cp('assets','public/assets',{recursive:true});
console.log('Frontend listo. SQL, pruebas y variables privadas fuera del contenido público.');

await cp('node_modules/leaflet/dist','public/assets/leaflet',{recursive:true});
