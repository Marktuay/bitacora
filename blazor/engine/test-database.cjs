'use strict';
// Used only by the migration verification suite. Production always uses pg.Pool.
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
function create(directory){
 const db=new PGlite(directory,{extensions:{pgcrypto}});
 const query=async(sql,args)=>{await db.waitReady;const r=args?await db.query(sql,args):(await db.exec(sql)).at(-1);return {rows:r?.rows||[],rowCount:r?.affectedRows??r?.rows?.length??0};};
 return {query,async connect(){return {query,release(){}};},end:()=>db.close(),raw:db};
}
module.exports={create};
