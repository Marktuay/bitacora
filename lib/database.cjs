'use strict';
const {Pool}=require('pg');
let instance;
function pool(){
 if(process.env.NODE_ENV==='test'&&process.env.BITACORA_TEST_DATABASE){
  return instance??=require('./test-database.cjs').create(process.env.BITACORA_TEST_DATABASE);
 }
 if(!process.env.DATABASE_URL)throw Object.assign(Error('PostgreSQL no configurado'),{status:503});
 return instance??=new Pool({connectionString:process.env.DATABASE_URL,max:12,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:30000});
}
async function transaction(work){const db=await pool().connect();try{await db.query('BEGIN');const value=await work(db);await db.query('COMMIT');return value;}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}}
module.exports={pool,transaction};
