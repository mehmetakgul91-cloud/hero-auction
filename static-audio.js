import {createReadStream,statSync} from 'node:fs';

// Arena audio uses one range at a time. Never read/decode the entire MP3 in memory.
export function audioByteRange(value,size){
 if(value===undefined)return null;
 if(typeof value!=='string')return false;
 // Unsupported range units and multipart requests fall back to a full 200.
 // Malformed/unsatisfiable single byte ranges return 416 instead.
 if(!/^bytes=/i.test(value.trim())||value.includes(','))return null;
 if(!Number.isSafeInteger(size)||size<=0)return false;
 const match=/^bytes=(\d*)-(\d*)$/i.exec(value.trim());
 if(!match||!match[1]&&!match[2])return false;
 if(!match[1]){
  const suffix=Number(match[2]);
  if(!Number.isSafeInteger(suffix)||suffix<=0)return false;
  return {start:Math.max(0,size-suffix),end:size-1};
 }
 const start=Number(match[1]),end=match[2]?Number(match[2]):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return false;
 return {start,end:Math.min(end,size-1)};
}

// Call only after the public static path and file have been validated by the server.
export function serveStaticAudio(req,res,file){
 const size=statSync(file).size;
 const headers={'Content-Type':'audio/mpeg','Content-Length':size,'Accept-Ranges':'bytes','Cache-Control':'no-store'};
 // Range applies to GET only. Without validators, If-Range cannot be verified,
 // so return the full representation rather than an unsafe partial response.
 const range=req.method==='GET'&&!req.headers['if-range']?audioByteRange(req.headers.range,size):null;
 if(range===false){
  res.writeHead(416,{...headers,'Content-Length':0,'Content-Range':'bytes */'+size});
  res.end();return;
 }
 if(range){headers['Content-Length']=range.end-range.start+1;headers['Content-Range']=`bytes ${range.start}-${range.end}/${size}`;}
 res.writeHead(range?206:200,headers);
 if(req.method==='HEAD'||size===0){res.end();return;}
 const stream=createReadStream(file,range||undefined);
 const cancel=()=>stream.destroy();
 res.once('close',cancel);
 stream.once('close',()=>res.off('close',cancel));
 stream.once('error',error=>res.destroy(error));
 stream.pipe(res);
}
