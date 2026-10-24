package tr.com.heroauction.android.test;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.SystemClock;
import android.util.Log;
import android.view.MotionEvent;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real Android WebView, bundled assets, native bridge and isolated HTTPS backend. */
@RunWith(AndroidJUnit4.class)
public class GameSmokeTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private WebView web;

    private String js(String code) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> web.evaluateJavascript(code, result -> {value.set(result); done.countDown();}));
        assertTrue("WebView JavaScript stopped responding", done.await(15, TimeUnit.SECONDS));
        return value.get();
    }
    private boolean is(String condition) throws Exception {return "true".equals(js("Boolean(" + condition + ")"));}
    private void until(String label, String condition, int seconds) throws Exception {
        long end = SystemClock.elapsedRealtime() + seconds * 1000L;
        while (SystemClock.elapsedRealtime() < end) {
            if (is(condition)) {Log.i("HeroSmoke", "PASS: " + label);return;}
            SystemClock.sleep(400);
        }
        Log.e("HeroSmoke", "State: " + js("JSON.stringify({path:location.pathname,ready:document.readyState,native:!!window.HeroNative,guestHandler:!!document.getElementById('guest-login')?.onclick,toast:document.getElementById('toast')?.textContent,status:document.getElementById('native-status')?.textContent,errors:window.__smokeErrors})"));
        fail("Timed out: " + label);
    }
    private void tap(String selector) throws Exception {
        String quoted = org.json.JSONObject.quote(selector);
        js("document.querySelector("+quoted+").scrollIntoView({block:'center'})");
        SystemClock.sleep(250);
        JSONArray point = new JSONArray(js("(()=>{const r=document.querySelector("+quoted+").getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,innerWidth]})()"));
        int[] origin=new int[2]; instrumentation.runOnMainSync(() -> web.getLocationOnScreen(origin));
        float scale=web.getWidth()/(float)point.getDouble(2);
        float x=origin[0]+(float)point.getDouble(0)*scale,y=origin[1]+(float)point.getDouble(1)*scale;
        long now=SystemClock.uptimeMillis();
        instrumentation.sendPointerSync(MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0));
        instrumentation.sendPointerSync(MotionEvent.obtain(now,now+80,MotionEvent.ACTION_UP,x,y,0));
    }
    @Test public void guestCanStartBotMatch() throws Exception {
        Intent intent=new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(intent);
        web=activity.getBridge().getWebView();
        until("bundled game JavaScript starts", "document.getElementById('guest-login')?.onclick && window.HeroNative?.configured", 60);
        js("window.__smokeErrors=[];addEventListener('error',e=>__smokeErrors.push(e.message));addEventListener('unhandledrejection',e=>__smokeErrors.push(String(e.reason)));document.getElementById('guest-name').value='Android QA'");
        tap("#guest-login");
        until("guest authenticates and loads commander choices", "!document.getElementById('commander-onboarding').hidden", 120);
        tap("#commander-onboarding-options button");
        tap("#commander-select-confirm");
        until("commander saved and lobby visible", "!document.getElementById('home').hidden", 60);
        if(is("document.querySelector('dialog[open] [data-guide=skip]')"))tap("dialog[open] [data-guide=skip]");
        tap("#home-play-tab");
        tap("#bot");
        until("bot match opens auction", "!document.getElementById('game').hidden && document.getElementById('game').dataset.phase==='auction'", 60);
        until("auction card portrait loads", "[...document.querySelectorAll('#stage .card-art img')].some(i=>i.complete&&i.naturalWidth>0)", 30);
        assertEquals("[]",js("window.__smokeErrors"));
    }
}
