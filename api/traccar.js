module.exports=async(req,res)=>{
 const action=new URL(req.url,'http://localhost').searchParams.get('action')||'';
 if(action.startsWith('mobile-'))return require('../lib/mobile-api').handler(req,res);
 return require('../lib/gps').handler(req,res);
};
