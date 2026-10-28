import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../android/app/src/main/java/tr/com/heroauction/android/test/NativeImageClient.java',import.meta.url),'utf8');
test('native alias contract delegates non-local requests and uses allowlist plus truthful MIME',()=>{
 assert.match(source,/mainFrame \|\| !"GET"\.equals\(method\)/);
 assert.match(source,/!"https"\.equals\(url.getScheme\(\)\)/);
 assert.match(source,/!"localhost"\.equals\(url.getEncodedAuthority\(\)\)/);
 assert.match(source,/return aliases.get\(url.getPath\(\)\)/);
 assert.match(source,/new WebResourceResponse\("image\/webp",null,assets.open\("public\/"\+asset\)\)/);
 assert.match(source,/return super.shouldInterceptRequest\(view,request\)/);
 assert.doesNotMatch(source,/getQueryParameter|HttpURLConnection|fetch|evaluateJavascript/);
});
test('diagnostic workflow does not publish or grant contents write',()=>{
 const flow=readFileSync(new URL('../../.github/workflows/android-portrait-diagnostics.yml',import.meta.url),'utf8');
 assert.match(flow,/contents: read/);
 assert.doesNotMatch(flow,/contents: write|gh release|git push|secrets\./);
});
test('image client registers before initial Capacitor navigation',()=>{
 const main=readFileSync(new URL('../android/app/src/main/java/tr/com/heroauction/android/test/MainActivity.java',import.meta.url),'utf8');
 assert.ok(main.indexOf('registerPlugin(NativeImagesPlugin.class)')<main.indexOf('super.onCreate(savedInstanceState)'));
 const bridge=readFileSync(new URL('../node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java',import.meta.url),'utf8');
 assert.ok(bridge.indexOf('this.registerAllPlugins()')<bridge.indexOf('this.loadWebView()'));
});
