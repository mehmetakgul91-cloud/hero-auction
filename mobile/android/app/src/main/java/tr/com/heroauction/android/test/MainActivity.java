package tr.com.heroauction.android.test;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeImagesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
