// Test process preload only; no application endpoint or production env bypass.
let clock=Date.now();Date.now=()=>clock;
process.on('message',message=>{if(message?.kind==='clock'&&Number.isSafeInteger(message.at)){clock=message.at;process.send?.({kind:'clock',at:clock});}});
