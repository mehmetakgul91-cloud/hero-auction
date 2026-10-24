// Use only as npm start on the explicitly approved test-service branch.
// Set isolation before importing server.js: no window for inherited DB access.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {ANDROID_TEST_RENDER_SERVICE_ID,androidTestMemoryMode} from '../android-test-mode.js';
export function isolatedAndroidStartup(env){
 if(env.RENDER!=='true'||env.RENDER_SERVICE_ID!==ANDROID_TEST_RENDER_SERVICE_ID)throw Error('Android test startup refuses any service other than the approved test service.');
 const configured={...env,ANDROID_TEST_MEMORY_ONLY:'1',NATIVE_ALLOWED_ORIGINS:'https://localhost'};
 if(!androidTestMemoryMode(configured))throw Error('Android test isolation unavailable.');
 return configured;
}
// A separate launcher keeps the production npm start command unchanged in main.
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const configured=isolatedAndroidStartup(process.env);
 process.env.ANDROID_TEST_MEMORY_ONLY=configured.ANDROID_TEST_MEMORY_ONLY;
 process.env.NATIVE_ALLOWED_ORIGINS=configured.NATIVE_ALLOWED_ORIGINS;
 await import('../server.js');
}
