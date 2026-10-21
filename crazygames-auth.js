import {createPublicKey,verify} from 'node:crypto';

// Never accept a key URL, user ID, wallet balance or profile from the browser.
export async function verifyCrazyGamesToken(token,{fetchKey,now=Date.now(),gameId=process.env.CRAZYGAMES_GAME_ID}={}){
 const reject=()=>{const e=new Error('CrazyGames kimliği doğrulanamadı.');e.status=401;throw e};
 if(typeof token!=='string'||token.length>8192)return reject();
 const parts=token.split('.');
 if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))return reject();
 let header,claims;
 try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'))}catch{return reject()}
 const seconds=now/1000;
 if(header?.alg!=='RS256'||header.crit||!claims||
  !Number.isFinite(claims.exp)||claims.exp<=seconds||
  !Number.isFinite(claims.iat)||claims.iat>seconds+30||claims.exp<=claims.iat||
  (claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>seconds))||
  typeof claims.userId!=='string'||!/^[-A-Za-z0-9_.]{1,80}$/.test(claims.userId)||
  typeof claims.gameId!=='string'||!/^[-A-Za-z0-9_.]{1,40}$/.test(claims.gameId)||
  (gameId&&claims.gameId!==String(gameId)))return reject();
 const getKey=fetchKey||async function(){
  const response=await fetch('https://sdk.crazygames.com/publicKey.json',{signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('CrazyGames kimlik hizmetine ulaşılamadı.');
  return (await response.json()).publicKey;
 };
 let valid=false;
 try{const key=createPublicKey(await getKey());if(key.asymmetricKeyType!=='rsa')return reject();valid=verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url'))}catch{return reject()}
 if(!valid)return reject();
 // Game-scoped IDs prevent a token for another game from opening this game's wallet.
 return {sub:'crazygames:'+claims.gameId+':'+claims.userId,name:String(claims.username||'Oyuncu').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,24)};
}
