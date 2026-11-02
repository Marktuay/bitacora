const ExcelJS = require('exceljs');
const T = require('../assets/trip-comparison');
const {savedFuel,fuelPairs}=require('../lib/fuel-report');
const {reportSignatures}=require('../lib/report-signatures');
const A=require('../lib/auth'),M=require('../lib/manager-area');
const { getCompany, dbReady, send, sb, tablePath, validPeriod, allRows } = require('./_config');

async function one(table, id) {
  const p = new URLSearchParams({ select: '*', id: `eq.${id}`, limit: '1' });
  const rows = await sb(tablePath(table, p));
  return rows?.[0] || null;
}

function safeFilePart(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 _-]/gi, '')
    .trim().replace(/\s+/g, '-');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método no permitido' });
  try {
    const u=new URL(req.url,'http://localhost'),requestedCompany=getCompany(u.searchParams.get('company')),employeeId=u.searchParams.get('employeeId'),auth=await A.session(req,res);
    if(requestedCompany&&A.canReview(auth,requestedCompany.slug)&&!auth.admin&&!await M.employee(auth,requestedCompany.slug,employeeId))throw A.fail(403,'No tenés acceso a colaboradores de esta área');
    const {company,employee,from,to,items}=await A.reportData(req,res);
    // Los mismos encabezados y datos de identificación se usan para jefe y colaborador.
    const fields = T.reportMeta(company, employee, items);
    const signatures=await reportSignatures(company,employee);
    const voucher=employee.id?await savedFuel(company.slug,employee.id,from,to):null;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bitácora KM';
    wb.created = new Date();
    const ws = wb.addWorksheet('Bitácora', {
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 }
      },
      views: [{ state: 'frozen', ySplit: 7 }]
    });

    const widths=[12,24,28,20,40,19,25,14,14,14,17,42];
    const cols=T.columns.map((header,i)=>[header,widths[i]]);
    ws.columns = cols.map(([header, width]) => ({ header, width }));

    ws.mergeCells('A1:L1');
    ws.getCell('A1').value = T.title;
    ws.getCell('A1').font = { bold: true, size: 15 };
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 24;

    ws.mergeCells('A2:L2');
    ws.getCell('A2').value = `Período: ${from} al ${to}`;
    ws.getCell('A2').font = { italic: true, size: 10 };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    const meta = [0, 2, 4].map(i => [
      fields[i].label, fields[i].value, fields[i + 1].label, fields[i + 1].value
    ]);
    let r = 3;
    for (const row of meta) {
      ws.getCell(r, 1).value = row[0]; ws.getCell(r, 1).font = { bold: true };
      ws.mergeCells(r, 2, r, 5); ws.getCell(r, 2).value = row[1];
      ws.getCell(r, 6).value = row[2]; ws.getCell(r, 6).font = { bold: true };
      ws.mergeCells(r, 7, r, 12); ws.getCell(r, 7).value = row[3];
      r++;
    }

    ws.mergeCells('A6:L6');ws.getCell('A6').value=require('../lib/report-status').summary(items);ws.getCell('A6').font={bold:true,size:10};
    const headerRow = 7;
    cols.forEach(([header], i) => {
      const c = ws.getCell(headerRow, i + 1);
      c.value = header;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    ws.getRow(headerRow).height = 28;

    const total=T.totals(items);
    items.forEach((x, idx) => {
      const rowNum = headerRow + 1 + idx;
      const values=T.values(x);
      values[7]=T.number(x.km_travel)??'—';values[8]=T.number(x.km_traccar)??'—';values[9]=T.difference(x)??'—';
      values.forEach((v,i)=>ws.getCell(rowNum,i+1).value=v);
      ws.getCell(rowNum,8).numFmt='0.0';ws.getCell(rowNum,9).numFmt='0.0';ws.getCell(rowNum,10).numFmt='+0.0;-0.0;0.0';
      ws.getRow(rowNum).alignment = { vertical: 'top', wrapText: true };
      const observation = String(values[11] ?? '');
      const observationLines = observation.split(/\r?\n/).reduce((n, part) => n + Math.max(1, Math.ceil(part.length / 40)), 0);
      const vehicleLines = String(values[2] ?? '').split(/\r?\n/).reduce((n, part) => n + Math.max(1, Math.ceil(part.length / 26)), 0);
      ws.getRow(rowNum).height = Math.min(409, Math.max(19, observationLines * 15, vehicleLines * 15));
      for (let c = 1; c <= 12; c++) {
        ws.getCell(rowNum, c).border = { top: { style: 'thin', color: { argb: 'FFD1D5DB' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
      }

    });

    const totalRow = headerRow + 1 + items.length;
    ws.mergeCells(totalRow,1,totalRow,7);
    ws.getCell(totalRow,1).value=`Total (${total.count} ${total.count===1?'recorrido':'recorridos'})`;
    ws.getCell(totalRow,1).alignment={horizontal:'right'};
    ws.getCell(totalRow,8).value=total.km;
    ws.getCell(totalRow,9).value=total.gps??'—';
    ws.getCell(totalRow,10).value=total.difference??'—';
    for(let c=1;c<=12;c++){
      const cell=ws.getCell(totalRow,c);cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8F0F7'}};
      cell.border={top:{style:'thin'},bottom:{style:'thin'}};
      if(c>=8&&c<=10)cell.numFmt=c===10?'+0.0;-0.0;0.0':'0.0';
    }
    if(total.missing){ws.mergeCells(totalRow+1,1,totalRow+1,12);ws.getCell(totalRow+1,1).value=T.note(total);ws.getCell(totalRow+1,1).alignment={wrapText:true};ws.getRow(totalRow+1).height=30;}

    let lastContentRow=totalRow+(total.missing?1:0);
    if(voucher){
      const first=lastContentRow+2;
      ws.mergeCells(first,1,first,12);
      const h=ws.getCell(first,1);h.value='RENDICION ULTIMO VALE';
      h.font={bold:true,size:11,color:{argb:'FFFFFFFF'}};
      h.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF334155'}};
      ws.getRow(first).height=21;
      const pairs=fuelPairs(voucher);
      for(let i=0;i<pairs.length;i+=2){
        const rowIndex=first+1+Math.floor(i/2);
        for(let j=0;j<2;j++){
          const metric=pairs[i+j];if(!metric)continue;
          const labelCol=j?7:1,valueCol=j?10:4;
          ws.mergeCells(rowIndex,labelCol,rowIndex,labelCol+2);
          ws.mergeCells(rowIndex,valueCol,rowIndex,valueCol+2);
          ws.getCell(rowIndex,labelCol).value=metric[0];
          ws.getCell(rowIndex,labelCol).font={bold:true,size:9};
          ws.getCell(rowIndex,valueCol).value=String(metric[1]);
          ws.getCell(rowIndex,valueCol).alignment={vertical:'middle',wrapText:true};
        }
        ws.getRow(rowIndex).height=26;
      }
      lastContentRow=first+Math.ceil(pairs.length/2);
    }
    let sigRow = lastContentRow + 4;
    ws.mergeCells(sigRow, 2, sigRow, 4);
    ws.getCell(sigRow, 2).value = '______________________________';
    ws.getCell(sigRow, 2).alignment = { horizontal: 'center' };
    ws.mergeCells(sigRow, 8, sigRow, 10);
    ws.getCell(sigRow, 8).value = '______________________________';
    ws.getCell(sigRow, 8).alignment = { horizontal: 'center' };
    ws.mergeCells(sigRow + 1, 2, sigRow + 1, 4);
    ws.getCell(sigRow + 1, 2).value = 'Elaborado por';
    ws.getCell(sigRow + 1, 2).font = { bold: true };
    ws.getCell(sigRow + 1, 2).alignment = { horizontal: 'center' };
    ws.mergeCells(sigRow + 2, 2, sigRow + 2, 4);
    ws.getCell(sigRow + 2, 2).value = signatures.elaboratedBy;
    ws.getCell(sigRow + 2, 2).alignment = { horizontal: 'center' };
    ws.mergeCells(sigRow + 1, 8, sigRow + 1, 10);
    ws.getCell(sigRow + 1, 8).value = 'Revisado / autorizado por';
    ws.getCell(sigRow + 1, 8).font = { bold: true };
    ws.getCell(sigRow + 1, 8).alignment = { horizontal: 'center' };
    ws.mergeCells(sigRow + 2, 8, sigRow + 2, 10);
    ws.getCell(sigRow + 2, 8).value = signatures.reviewedBy;
    ws.getCell(sigRow + 2, 8).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getRow(sigRow + 2).height = 30;

    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: Math.max(headerRow + 1, totalRow - 1), column: 12 } };
    ws.pageSetup.printArea = `A1:L${sigRow + 2}`;
    // Evita repetir los títulos de la tabla en páginas finales con solo rendición y firmas.
    ws.headerFooter.oddFooter = '&C Página &P de &N';

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `Bitacora-${safeFilePart(employee.name)}-${from}-${to}.xlsx`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(buffer));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) return send(res, error.status||503, { error: error.status?error.message:'No fue posible generar el Excel' });
    try { res.end(); } catch {}
  }
};
