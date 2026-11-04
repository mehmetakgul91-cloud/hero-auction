// Local-only synthetic preview. No accounts, API writes or production traffic.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.html':'text/html'};
createServer(async(req,res)=>{try{if(req.method!=='GET'){res.writeHead(405).end();return;}const u=new URL(req.url,'http://localhost');let filename;if(u.pathname==='/')filename=fileURLToPath(new URL('./preview-target-swings.html',import.meta.url));else{filename=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}}const bytes=await readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' data: 'unsafe-inline'; connect-src 'none'; img-src 'self' data:"}).end(bytes);}catch{res.writeHead(404).end('Not found')}}).listen(3141,'127.0.0.1',()=>console.log('Target swings http://127.0.0.1:3141'));
