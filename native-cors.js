// Opt-in transport support for the separately packaged Android client.
// This never authenticates a request; every existing API/room token check remains.
export function nativeOrigins(value=''){
 const origins=new Set();
 for(const entry of String(value).split(',').map(part=>part.trim()).filter(Boolean)){
  let url;try{url=new URL(entry)}catch{throw Error('NATIVE_ALLOWED_ORIGINS must contain exact HTTPS origins.')}
  if(url.protocol!=='https:'||url.origin!==entry||url.username||url.password||url.pathname!=='/'||url.search||url.hash||entry.includes('*')){
   throw Error('NATIVE_ALLOWED_ORIGINS must contain exact HTTPS origins without paths, credentials or wildcards.');
  }
  origins.add(entry);
 }
 return origins;
}

function vary(res,...names){
 const current=String(res.getHeader('Vary')||'').split(',').map(part=>part.trim()).filter(Boolean);
 for(const name of names)if(!current.some(value=>value.toLowerCase()===name.toLowerCase()))current.push(name);
 res.setHeader('Vary',current.join(', '));
}

export function createNativeCors(value=''){
 const origins=nativeOrigins(value);
 return function nativeCors(req,res,pathname){
  // Empty configuration preserves the web deployment's existing behavior/headers.
  if(!origins.size||!pathname.startsWith('/api/'))return false;
  const origin=req.headers.origin;
  if(!origin)return false;
  if(req.method==='OPTIONS'){
   const method=req.headers['access-control-request-method'];
   const headers=String(req.headers['access-control-request-headers']||'').split(',').map(part=>part.trim().toLowerCase()).filter(Boolean);
   const allowed=origins.has(origin)&&['GET','POST'].includes(method)&&headers.every(name=>name==='content-type');
   vary(res,'Origin','Access-Control-Request-Method','Access-Control-Request-Headers');
   res.setHeader('Cache-Control','no-store');
   if(!allowed){
    res.writeHead(403,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({error:'Native API preflight is not allowed.'}));return true;
   }
   res.setHeader('Access-Control-Allow-Origin',origin);
   res.setHeader('Access-Control-Allow-Methods','GET, POST');
   res.setHeader('Access-Control-Allow-Headers','Content-Type');
   res.writeHead(204);res.end();return true;
  }
  // Rejected actual origins/methods keep the existing API behavior, but receive
  // no CORS grant. CORS is not access control and does not replace token auth.
  if(!origins.has(origin)||!['GET','POST'].includes(req.method))return false;
  vary(res,'Origin');
  res.setHeader('Access-Control-Allow-Origin',origin);
  // setHeader survives API send()/SSE writeHead(), including error responses.
  return false;
 };
}
