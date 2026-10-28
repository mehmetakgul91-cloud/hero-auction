import { spawnSync } from 'node:child_process';
import { doctor } from './doctor.mjs';
if(!doctor())process.exit(1);
const result=spawnSync(process.platform==='win32'?'gradlew.bat':'./gradlew',['--no-daemon',':app:assembleDebug'],{cwd:new URL('../android/',import.meta.url),stdio:'inherit',env:process.env});
process.exitCode=result.status??1;
if(!process.exitCode)console.log('Debug test APK: mobile/android/app/build/outputs/apk/debug/app-debug.apk. Compilation is not a device test or backend verification.');
