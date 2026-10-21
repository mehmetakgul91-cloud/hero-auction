// Test process only: substitute the provider key, never the verification logic.
const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>String(url)==='https://sdk.crazygames.com/publicKey.json'
 ?Promise.resolve(new Response(JSON.stringify({publicKey:process.env.CG_TEST_PUBLIC_KEY}),{headers:{'Content-Type':'application/json'}}))
 :nativeFetch(url,options);
