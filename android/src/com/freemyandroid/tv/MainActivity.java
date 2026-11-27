package com.freemyandroid.tv;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * One screen: a WebView with the app's pages (assets/app), and a small bridge ("FMA") that lets those pages list the
 * TV's apps, open one, and read whether the television list's packages are on or switched off. Nothing here changes
 * anything on the TV: switching apps off is done from a computer, with Free My Android, over ADB.
 */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F5F5F7"));
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // the small apps keep their state in localStorage
        s.setMediaPlaybackRequiresUserGesture(false);   // the timer's chime
        s.setAllowContentAccess(false);
        s.setAllowFileAccess(false);             // assets are still reachable at file:///android_asset
        s.setTextZoom(100);                      // the TV's font size setting would break a 1920 x 1080 layout
        // The page is laid out at the screen's own width and scales its 1920 x 1080 stage itself. A wide viewport
        // made a Mi TV (Android 9, 1280 x 720) report 1920 as the width, and the stage was drawn unscaled and cut off.
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith("file:///android_asset/");   // the pages never leave the app
            }
        });
        web.addJavascriptInterface(new Bridge(), "FMA");
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        setContentView(web);
        web.loadUrl("file:///android_asset/app/index.html");
        web.requestFocus();
    }

    /** Back goes to the page first (it closes a small app or a sheet); only when it has nothing to close does the app go. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("window.fmaBack ? String(window.fmaBack()) : 'false'", new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String used) {
                        if (!"\"true\"".equals(used) && !"true".equals(used)) finish();
                    }
                });
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.fmaResumed && window.fmaResumed()", null);
    }

    final class Bridge {
        /** The apps in the TV's apps row: [{pkg, label, art (a PNG data URL, the banner where there is one)}]. */
        @JavascriptInterface
        public String apps() {
            JSONArray out = new JSONArray();
            try {
                PackageManager pm = getPackageManager();
                Set<String> seen = new HashSet<String>();
                List<ResolveInfo> found = new ArrayList<ResolveInfo>();
                Intent tv = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
                found.addAll(pm.queryIntentActivities(tv, 0));
                for (ResolveInfo r : found) {
                    ActivityInfo a = r.activityInfo;
                    if (a == null || getPackageName().equals(a.packageName) || !seen.add(a.packageName)) continue;
                    JSONObject o = new JSONObject();
                    o.put("pkg", a.packageName);
                    o.put("label", String.valueOf(r.loadLabel(pm)));
                    Drawable art = a.loadBanner(pm);
                    if (art == null) art = a.applicationInfo.loadBanner(pm);
                    boolean banner = art != null;
                    if (art == null) art = r.loadIcon(pm);
                    o.put("art", png(art, banner ? 320 : 160, banner ? 180 : 160));
                    o.put("banner", banner);
                    out.put(o);
                }
            } catch (Exception e) {
                // An empty list: the page says there is nothing to show.
            }
            return out.toString();
        }

        /** Opens an app from the apps row. */
        @JavascriptInterface
        public boolean open(String pkg) {
            try {
                PackageManager pm = getPackageManager();
                Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
                if (i == null) i = pm.getLaunchIntentForPackage(pkg);
                if (i == null) return false;
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** For each package asked about: "on", "off" (switched off) or "absent" (not on this TV). Reading only. */
        @JavascriptInterface
        public String states(String idsJson) {
            JSONObject out = new JSONObject();
            try {
                PackageManager pm = getPackageManager();
                JSONArray ids = new JSONArray(idsJson);
                for (int k = 0; k < ids.length(); k++) {
                    String id = ids.getString(k);
                    String state;
                    try {
                        ApplicationInfo ai = pm.getApplicationInfo(id, PackageManager.MATCH_DISABLED_COMPONENTS);
                        int set = pm.getApplicationEnabledSetting(id);
                        boolean on = set == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                                || (set == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && ai.enabled);
                        state = on ? "on" : "off";
                    } catch (Exception notThere) {
                        state = "absent";
                    }
                    out.put(id, state);
                }
            } catch (Exception e) {
                // An empty answer: the page says it could not read them.
            }
            return out.toString();
        }

        /** A line in the TV's log (adb logcat -s FreeMyAndroid), for what the page measures on a real set. */
        @JavascriptInterface
        public void log(String line) {
            android.util.Log.i("FreeMyAndroid", String.valueOf(line));
        }

        /** The set, for the "This TV" page. */
        @JavascriptInterface
        public String device() {
            JSONObject o = new JSONObject();
            try {
                o.put("maker", Build.MANUFACTURER);
                o.put("model", Build.MODEL);
                o.put("android", Build.VERSION.RELEASE);
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("version", getPackageManager().getPackageInfo(getPackageName(), 0).versionName);
            } catch (Exception e) {
                // whatever was read
            }
            return o.toString();
        }
    }

    private static String png(Drawable d, int w, int h) {
        try {
            Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            d.setBounds(0, 0, w, h);
            d.draw(c);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, bytes);
            b.recycle();
            return "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }
}
