package tr.com.heroauction.android.test;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.SystemClock;
import android.util.Log;
import android.view.MotionEvent;
import android.view.InputDevice;
import android.accessibilityservice.AccessibilityService;
import android.view.KeyEvent;
import android.webkit.WebView;
import android.graphics.Bitmap;
import java.io.File;
import java.io.FileOutputStream;
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
        long focusDeadline=SystemClock.elapsedRealtime()+30000;
        AtomicReference<Boolean> focused=new AtomicReference<>(false);
        do {
            instrumentation.runOnMainSync(()->focused.set(web.hasWindowFocus()));
            if(focused.get())break;
            SystemClock.sleep(200);
        } while(SystemClock.elapsedRealtime()<focusDeadline);
        assertTrue("Android app window must regain focus before tapping "+selector,focused.get());
        String quoted = org.json.JSONObject.quote(selector);
        // CSS smooth scrolling can still be moving when a hardware tap is injected.
        // Force instant scroll and verify hit-testing before sending the gesture.
        js("document.querySelector("+quoted+").scrollIntoView({block:'center',behavior:'instant'})");
        until("tap target visible: "+selector, "(()=>{const e=document.querySelector("+quoted+");const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return x>0&&y>0&&x<innerWidth&&y<innerHeight&&e.contains(document.elementFromPoint(x,y))})()", 15);
        SystemClock.sleep(500);
        JSONArray point = new JSONArray(js("(()=>{const r=document.querySelector("+quoted+").getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,innerWidth]})()"));
        int[] origin=new int[3]; instrumentation.runOnMainSync(() -> {
            assertTrue("WebView must own focus before a hardware tap", web.hasWindowFocus());
            web.getLocationOnScreen(origin);origin[2]=web.getWidth();
        });
        float scale=origin[2]/(float)point.getDouble(2);
        float x=origin[0]+(float)point.getDouble(0)*scale,y=origin[1]+(float)point.getDouble(1)*scale;
        long now=SystemClock.uptimeMillis();
        // UiAutomation injects real device input without targeting the test
        // process UID. Keep hit-testing/focus assertions; never use DOM click().
        MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0);
        MotionEvent up=MotionEvent.obtain(now,now+80,MotionEvent.ACTION_UP,x,y,0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            assertTrue("touch down accepted: "+selector,instrumentation.getUiAutomation().injectInputEvent(down,true));
            assertTrue("touch up accepted: "+selector,instrumentation.getUiAutomation().injectInputEvent(up,true));
        } finally {down.recycle();up.recycle();}
    }
    private void screenshot(String name) throws Exception {
        js("window.__capturePainted=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__capturePainted=true))");
        until("capture frame settled: "+name,"window.__capturePainted",10);
        SystemClock.sleep(350); // Allow the compositor to present the frame after DOM assertions.
        // Gradle uninstalls the app after tests, deleting its cache before adb
        // artifact collection. Shell-owned diagnostic files survive teardown.
        try(java.io.InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(
            instrumentation.getUiAutomation().executeShellCommand(
                "screencap -p /sdcard/Download/hero-portrait-"+name+".png"))) {
            byte[] buffer=new byte[1024];while(input.read(buffer)!=-1) {}
        }
    }
    private void portraitLayout(String stage, String orderedSelectors) throws Exception {
        assertTrue(stage+": portrait viewport",is("innerHeight>innerWidth"));
        assertTrue(stage+": no horizontal document overflow",is("document.documentElement.scrollWidth<=innerWidth+1"));
        String selectors=org.json.JSONObject.quote(orderedSelectors);
        String geometry=js("JSON.stringify("+selectors+".split('|').map(s=>{const e=document.querySelector(s),r=e?.getBoundingClientRect();return {selector:s,top:r?.top,bottom:r?.bottom,position:e?getComputedStyle(e).position:null}}))");
        assertTrue(stage+": primary panels do not overlap: "+geometry,is("(()=>{const a="+selectors+".split('|').map(s=>document.querySelector(s)).filter(e=>e&&!e.hidden).map(e=>e.getBoundingClientRect());return a.every((r,i)=>i===0||r.top>=a[i-1].bottom-1)})()"));
    }
    private void verifyMenu() throws Exception {
        tap("#native-game-menu>summary");
        until("native menu visible", "document.getElementById('native-game-menu').open",10);
        assertTrue("close action is at least 44 CSS pixels",is("document.querySelector('.native-menu-close').getBoundingClientRect().height>=44"));
        assertTrue("menu above audio and game",is("(()=>{const e=document.querySelector('.native-menu-close'),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"));
        tap(".native-menu-close");
        until("native menu closes", "!document.getElementById('native-game-menu').open",10);
    }
    @Test public void guestCanPlayThroughAuctionAndArena() throws Exception {
        Intent intent=new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(intent);
        web=activity.getBridge().getWebView();
        until("bundled game JavaScript starts", "document.getElementById('guest-login')?.onclick && window.HeroNative?.configured", 60);
        js("window.__aliasChecks=null;fetch('/native-image-aliases.json').then(r=>r.json()).then(m=>Promise.all(Object.keys(m).map(url=>new Promise(resolve=>{const i=new Image;i.onload=()=>resolve(i.naturalWidth>0);i.onerror=()=>resolve(false);i.src=url+'?portrait-check=1'})))).then(r=>window.__aliasChecks=r)");
        until("all packaged lossless portrait aliases render on cold launch", "window.__aliasChecks?.length>0 && window.__aliasChecks.every(Boolean)",30);
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
        portraitLayout("auction", ".auction-hero|.auction-action");
        assertTrue("auction player panels must not cover the card heading",is("document.querySelector('.arena-stage').getBoundingClientRect().top>=Math.max(...[...document.querySelectorAll('#game .player-side')].map(e=>e.getBoundingClientRect().bottom))-1"));
        verifyMenu();
        screenshot("auction");
        js("document.getElementById('bidbutton').scrollIntoView({block:'center',behavior:'instant'})");
        screenshot("auction-bids");
        long end=SystemClock.elapsedRealtime()+180000;
        while(SystemClock.elapsedRealtime()<end && !is("document.getElementById('confirm-arena-entry') && !document.getElementById('confirm-arena-entry').disabled")) {
            if(is("document.getElementById('passbutton') && !document.getElementById('passbutton').disabled"))tap("#passbutton");
            SystemClock.sleep(1200);
        }
        until("auction delivers all ten cards", "document.getElementById('confirm-arena-entry') && !document.getElementById('confirm-arena-entry').disabled", 20);
        assertEquals("[]",js("window.__smokeErrors"));
        tap("#confirm-arena-entry");
        until("formation loads and all five heroes are placed", "document.getElementById('formation-placed-count')?.textContent==='5 / 5' && !document.getElementById('apply-roles').disabled",60);
        until("formation portraits decode", "document.querySelectorAll('.battle-board img').length===5 && [...document.querySelectorAll('.battle-board img')].every(i=>i.complete&&i.naturalWidth>0)",30);
        js("window.__smokeErrors=[];addEventListener('error',e=>__smokeErrors.push(e.message));addEventListener('unhandledrejection',e=>__smokeErrors.push(String(e.reason)))");
        screenshot("formation");
        portraitLayout("formation", ".battle-board|.preparation-ready-bar");
        js("document.getElementById('apply-roles').scrollIntoView({block:'center',behavior:'instant'})");
        screenshot("formation-ready");
        tap("#apply-roles");
        until("ready opens the battle arena", "document.body.classList.contains('arena-room') && document.querySelectorAll('#team-a .hero').length===5", 60);
        until("battle receives live actions", "document.getElementById('events')?.children.length>0",90);
        portraitLayout("arena", ".arena-room-nav|#arena-score|#battle-arena|.arena-commander-dock|.controls");
        verifyMenu();
        screenshot("arena");
        js("document.querySelector('.arena-commander-dock').scrollIntoView({block:'center',behavior:'instant'})");
        screenshot("arena-controls");
        assertTrue("Home action succeeds",instrumentation.getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME));
        SystemClock.sleep(1500);
        instrumentation.getTargetContext().startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
        until("app resumes with the same active match", "window.HeroNative.active && document.body.classList.contains('arena-room')",30);
        until("match reaches its result", "!document.getElementById('arena-victory-reveal').hidden || !document.getElementById('battle-summary').hidden",180);
        if(is("!document.getElementById('arena-victory-reveal').hidden"))tap("#arena-victory-continue");
        until("final results panel is visible", "!document.getElementById('battle-summary').hidden && document.getElementById('battle-summary').getClientRects().length>0",30);
        js("document.getElementById('battle-summary').scrollIntoView({block:'start',behavior:'instant'})");
        screenshot("result");
        assertEquals("[]",js("window.__smokeErrors"));
    }
}

