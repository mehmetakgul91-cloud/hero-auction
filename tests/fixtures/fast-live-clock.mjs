// Only loaded by the isolated HTTP test process; production pacing is unchanged.
const realNow=Date.now,epoch=realNow(),nativeInterval=globalThis.setInterval;
Date.now=()=>epoch+(realNow()-epoch)*30;
globalThis.setInterval=(fn,ms,...args)=>nativeInterval(fn,ms===900?30:ms,...args);
