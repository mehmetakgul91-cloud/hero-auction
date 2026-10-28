package tr.com.heroauction.android.test;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Installs before Capacitor's first loadWebView, avoiding startup image races.
 * No JavaScript-callable methods and no change to network/bridge permissions. */
@CapacitorPlugin(name="NativeImages")
public final class NativeImagesPlugin extends Plugin {
    @Override public void load() {
        getBridge().setWebViewClient(new NativeImageClient(getBridge(),getContext().getAssets()));
    }
}
