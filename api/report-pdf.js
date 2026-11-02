const PDFDocument=require('pdfkit');
const {send}=require('./_config');
const T=require('../assets/trip-comparison');
const A=require('../lib/auth'),M=require('../lib/manager-area'),{getCompany}=require('./_config');
const printable=value=>String(value??'').replaceAll('→','>');
const {savedFuel,fuelPairs}=require('../lib/fuel-report');
const {reportSignatures}=require('../lib/report-signatures');
function cell(doc,text,x,y,w,opts={}){doc.font(opts.bold?'Helvetica-Bold':'Helvetica').fontSize(opts.size||7).text(printable(text),x,y,{width:w,height:opts.height||24,ellipsis:true,align:opts.align||'left'});}
function line(doc,x1,y1,x2,y2){doc.moveTo(x1,y1).lineTo(x2,y2).strokeColor('#8795a1').lineWidth(.5).stroke();}
module.exports=async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{error:'Método no permitido'});
 try{
  const u=new URL(req.url,'http://localhost'),requestedCompany=getCompany(u.searchParams.get('company')),employeeId=u.searchParams.get('employeeId'),auth=await A.session(req,res);
  if(requestedCompany&&A.canReview(auth,requestedCompany.slug)&&!auth.admin&&!await M.employee(auth,requestedCompany.slug,employeeId))throw A.fail(403,'No tenés acceso a colaboradores de esta área');
  const {company,employee,from,to,items}=await A.reportData(req,res);
  const fields=T.reportMeta(company,employee,items);
  const signatures=await reportSignatures(company,employee);
  const voucher=employee.id?await savedFuel(company.slug,employee.id,from,to):null;
  const safeName=employee.name.replace(/[^a-z0-9áéíóúñ _-]/gi,'').replace(/\s+/g,'-');
  res.statusCode=200;res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="Bitacora-${safeName}-${from}-${to}.pdf"`);res.setHeader('Cache-Control','no-store');
  const doc=new PDFDocument({size:'A4',layout:'landscape',margin:28});doc.pipe(res);
  const left=28,right=doc.page.width-28,width=right-left;
  doc.font('Helvetica-Bold').fontSize(14).text(T.title,left,28,{width,align:'center'});
  doc.font('Helvetica').fontSize(8).text(`${company.name} · Período: ${from} al ${to}`,left,48,{width,align:'center'});
  doc.font('Helvetica-Bold').fontSize(7).text(require('../lib/report-status').summary(items),left,60,{width,align:'center'});
  // Igual que Excel: tres filas con dos campos de identificación en cada una.
  for(let i=0;i<fields.length;i+=2){
   const yMeta=74+(i/2)*20;
   for(let j=0;j<2;j++){
    const f=fields[i+j],w=width/2,x=left+j*w;
    doc.rect(x,yMeta,w,20).strokeColor('#8795a1').lineWidth(.5).stroke();
    cell(doc,f.label,x+4,yMeta+5,w*.32-8,{bold:true,size:6,height:12});
    cell(doc,f.value,x+w*.32,yMeta+5,w*.68-8,{size:7,height:12});
   }
  }
  const weights=[45,65,77,48,100,55,81,43,43,45,52,145],sum=weights.reduce((a,b)=>a+b,0),ws=weights.map(w=>w*width/sum);
  let y=146;const footerLimit=doc.page.height-36;
  function header(){let xx=left;T.columns.forEach((h,i)=>{doc.rect(xx,y,ws[i],28).fillAndStroke('#334155','#8795a1');doc.fillColor('#ffffff');cell(doc,h,xx+3,y+5,ws[i]-6,{bold:true,size:6.3,align:'center',height:20});xx+=ws[i];});y+=28;doc.fillColor('#17212b');}
  function newPage(withHeader=true){doc.addPage({size:'A4',layout:'landscape',margin:28});y=30;if(withHeader)header();}
  header();
  for(const row of items){
   // Dividir celdas extensas entre páginas para no recortar observaciones.
   let remaining=T.values(row).map(printable);
   do{
    if(y+28>footerLimit)newPage();
    doc.font('Helvetica').fontSize(6.6);
    const available=footerLimit-y;
    const fragments=remaining.map((text,i)=>{
     if(!text)return '';
     const fits=part=>doc.heightOfString(part,{width:ws[i]-6})+12<=available;
     if(fits(text))return text;
     let lo=1,hi=text.length,cut=1;
     while(lo<=hi){
      const mid=Math.floor((lo+hi)/2);
      if(fits(text.slice(0,mid))){cut=mid;lo=mid+1;}else hi=mid-1;
     }
     const boundary=Math.max(text.lastIndexOf(' ',cut-1),text.lastIndexOf('\n',cut-1));
     if(boundary>=Math.floor(cut/2))cut=boundary+1;
     return text.slice(0,cut);
    });
    const height=Math.max(28,...fragments.map((v,i)=>doc.heightOfString(v||' ',{width:ws[i]-6})+12));
    let xx=left;
    fragments.forEach((v,i)=>{doc.rect(xx,y,ws[i],height).strokeColor('#a9b4be').lineWidth(.4).stroke();cell(doc,v,xx+3,y+6,ws[i]-6,{size:6.6,height:height-10,align:i>=7&&i<=9?'right':'left'});xx+=ws[i];});
    y+=height;
    remaining=remaining.map((v,i)=>v.slice(fragments[i].length));
    if(remaining.some(Boolean))newPage();
   }while(remaining.some(Boolean));
  }
  // Al pasar los totales a otra página no crear un encabezado sin filas debajo.
  if(y+28>footerLimit)newPage(false);
  const total=T.totals(items),totalWidth=ws.slice(0,7).reduce((a,b)=>a+b,0);let xx=left;
  doc.rect(xx,y,totalWidth,28).fillAndStroke('#e8f0f7','#8795a1');doc.fillColor('#17212b');cell(doc,`Total (${total.count} ${total.count===1?'recorrido':'recorridos'})`,xx+3,y+8,totalWidth-6,{bold:true,size:7,align:'right'});xx+=totalWidth;
  [T.km(total.km),T.km(total.gps),T.signed(total.difference),'',''].forEach((v,i)=>{doc.rect(xx,y,ws[i+7],28).fillAndStroke('#e8f0f7','#8795a1');doc.fillColor('#17212b');cell(doc,v,xx+3,y+8,ws[i+7]-6,{bold:true,size:7,align:'right'});xx+=ws[i+7];});y+=34;
  if(total.missing){if(y+30>footerLimit){doc.addPage();y=30;}doc.font('Helvetica').fontSize(7).text(T.note(total),left,y,{width});y=doc.y+10;}
  if(voucher){
   const pairs=fuelPairs(voucher),height=18,totalHeight=25+Math.ceil(pairs.length/2)*height+28;
   if(y+totalHeight+63>footerLimit){doc.addPage({size:'A4',layout:'landscape',margin:28});y=30;}
   doc.font('Helvetica-Bold').fontSize(9).fillColor('#17212b')
     .text('RENDICION ULTIMO VALE',left,y,{width});
   y+=23;
   for(let i=0;i<pairs.length;i+=2){
    for(let j=0;j<2;j++){
     const part=pairs[i+j];if(!part)continue;
     const ox=left+j*width/2;
     doc.rect(ox,y,width/2,height).strokeColor('#b6c2cc').lineWidth(.4).stroke();
     cell(doc,part[0],ox+5,y+5,width*.25-10,{bold:true,size:6,height:10});
     cell(doc,part[1],ox+width*.25,y+5,width*.25-8,{size:7,height:12});
    }
    y+=height;
   }
   y+=8;
  }
  y+=34;if(y+30>footerLimit){doc.addPage({size:'A4',layout:'landscape',margin:28});y=60;}
  const sigW=240;line(doc,left+40,y,left+40+sigW,y);line(doc,right-40-sigW,y,right-40,y);
  cell(doc,'Elaborado por',left+40,y+6,sigW,{bold:true,align:'center'});cell(doc,signatures.elaboratedBy,left+40,y+18,sigW,{align:'center'});cell(doc,'Revisado / autorizado por',right-40-sigW,y+6,sigW,{bold:true,align:'center'});cell(doc,signatures.reviewedBy,right-40-sigW,y+18,sigW,{align:'center'});
  doc.end();
 }catch(error){console.error(error);if(!res.headersSent)return send(res,error.status||503,{error:error.status?error.message:'No fue posible generar el PDF'});try{res.end();}catch{}}
};
