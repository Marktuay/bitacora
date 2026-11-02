const valid=['all','approved','unapproved'];
function filter(items,value='all'){
 if(!valid.includes(value))throw Object.assign(Error('Filtro de aprobación inválido'),{status:400});
 return value==='all'?items:items.filter(x=>value==='approved'?x.review_status==='Aprobado':x.review_status!=='Aprobado');
}
function summary(items){const approved=items.filter(x=>x.review_status==='Aprobado').length;return `Gestiones aprobadas: ${approved} de ${items.length} · Sin aprobar: ${items.length-approved}`;}
module.exports={filter,summary};
