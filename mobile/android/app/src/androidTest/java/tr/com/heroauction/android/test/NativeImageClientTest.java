package tr.com.heroauction.android.test;

import static org.junit.Assert.*;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.Collections;
import java.util.Map;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeImageClientTest {
    private final Map<String,String> aliases=Collections.singletonMap("/images/original/hero-01.png","images/original/hero-01.lossless.webp");
    private String resolve(String url,String method,boolean mainFrame) {
        return NativeImageClient.localImagePath(Uri.parse(url),method,mainFrame,aliases);
    }
    @Test public void onlyExactLocalImagesAreAliased() {
        String local="https://localhost/images/original/hero-01.png";
        assertEquals("images/original/hero-01.lossless.webp",resolve(local,"GET",false));
        assertEquals(resolve(local,"GET",false),resolve(local+"?v=1&path=/secret","GET",false));
        assertNull(resolve(local,"POST",false));
        assertNull(resolve(local,"HEAD",false));
        assertNull(resolve(local,"GET",true));
        for(String url:new String[]{
            "http://localhost/images/original/hero-01.png",
            "https://example.com/images/original/hero-01.png",
            "https://localhost.evil/images/original/hero-01.png",
            "https://user@localhost/images/original/hero-01.png",
            "https://localhost:8765/images/original/hero-01.png",
            "https://localhost/api/state",
            "https://localhost/images/original/../hero-01.png",
            "https://localhost/images/original/%2e%2e/hero-01.png",
            "https://localhost/images/original/missing.png",
            "file:///images/original/hero-01.png"})assertNull(url,resolve(url,"GET",false));
        Map<String,String> turkish=Collections.singletonMap("/images/Altın Aslanın Kale Muhafızı.png","images/commander.lossless.webp");
        assertEquals("images/commander.lossless.webp",NativeImageClient.localImagePath(
            Uri.parse("https://localhost/images/Alt%C4%B1n%20Aslan%C4%B1n%20Kale%20Muhaf%C4%B1z%C4%B1.png?v=2"),"GET",false,turkish));
    }
}
