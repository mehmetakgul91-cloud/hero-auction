import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
export function doctor() {
  const sdk=process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const checks=[
    ['Node 22+', Number(process.versions.node.split('.')[0])>=22],
    ['Java 21+ compiler (full JDK, not runtime only)', (()=>{const bin=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/javac'):'javac';const result=spawnSync(bin,['-version'],{encoding:'utf8'});return result.status===0 && Number((result.stdout+result.stderr).match(/javac (\d+)/)?.[1])>=21;})()],
    ['ANDROID_HOME or ANDROID_SDK_ROOT set', !!sdk],
    ['Android platform 36', !!sdk && existsSync(path.join(sdk,'platforms/android-36/android.jar'))],
    ['Android build-tools 36.0.0', !!sdk && existsSync(path.join(sdk,'build-tools/36.0.0/aapt2'))]
  ];
  for(const [name,ok] of checks)console.log(`${ok?'OK':'MISSING'} ${name}`);
  if(checks.some(([,ok])=>!ok))console.log('Install missing SDK packages only after personally accepting/authorizing https://developer.android.com/studio/terms. This script never installs packages or accepts licenses.');
  return checks.every(([,ok])=>ok);
}
if(process.argv[1]?.endsWith('doctor.mjs')) process.exitCode=doctor()?0:1;
