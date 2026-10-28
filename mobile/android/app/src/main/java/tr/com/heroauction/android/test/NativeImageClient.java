package tr.com.heroauction.android.test;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.content.res.AssetManager;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/** Presentation-only aliases. All non-allowlisted requests use Capacitor unchanged. */
public final class NativeImageClient extends BridgeWebViewClient {
    private final AssetManager assets;
    private final Map<String,String> aliases;
    NativeImageClient(Bridge bridge, AssetManager assets) {
        super(bridge);
        this.assets=assets;
        Map<String,String> loaded=new HashMap<>();
        try(InputStream stream=assets.open("public/native-image-aliases.json")) {
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            byte[] buffer=new byte[4096];int count;
            while((count=stream.read(buffer))!=-1)bytes.write(buffer,0,count);
            JSONObject data=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
            Iterator<String> keys=data.keys();
            while(keys.hasNext()) {
                String key=keys.next(), value=data.getString(key);
                if(!key.startsWith("/images/") || !key.endsWith(".png") || key.contains("..") ||
                   !value.startsWith("images/") || !value.endsWith(".lossless.webp") || value.contains(".."))
                    throw new IllegalArgumentException("Invalid native image alias");
                loaded.put(key,value);
            }
        } catch(Exception error) {
            throw new IllegalStateException("Native image manifest missing or invalid",error);
        }
        aliases=Collections.unmodifiableMap(loaded);
    }
    static String localImagePath(Uri url, String method, boolean mainFrame, Map<String,String> aliases) {
        if(mainFrame || !"GET".equals(method) || !"https".equals(url.getScheme()) ||
           !"localhost".equals(url.getEncodedAuthority()))return null;
        // Exact decoded allowlist lookup, never concatenate a request path into assets.
        // Query strings are cache keys only; cannot select an arbitrary local file.
        return aliases.get(url.getPath());
    }
    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String asset=localImagePath(request.getUrl(),request.getMethod(),request.isForMainFrame(),aliases);
        if(asset!=null) {
            try {
                WebResourceResponse response=new WebResourceResponse("image/webp",null,assets.open("public/"+asset));
                response.setResponseHeaders(Collections.singletonMap("X-Content-Type-Options","nosniff"));
                return response;
            } catch(java.io.IOException error) {
                return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",
                    Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
            }
        }
        return super.shouldInterceptRequest(view,request);
    }
}
