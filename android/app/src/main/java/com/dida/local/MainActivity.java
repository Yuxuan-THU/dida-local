package com.dida.local;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String PREFS = "dida";
    private static final String KEY_URL = "server_url";
    private static final String KEY_TOKEN = "access_token";
    private static final String DEFAULT_URL = "";
    private static final String DEFAULT_TOKEN = "";

    private WebView webView;
    private boolean showingSetup = false;

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(true);
        }
        getWindow().setStatusBarColor(Color.rgb(247, 248, 251));
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 10);
        }

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String url = prefs.getString(KEY_URL, "");
        String token = prefs.getString(KEY_TOKEN, "");
        if (url == null || url.trim().isEmpty()) {
            showSetup();
        } else {
            loadApp(url, token);
        }
    }

    private TextView titleView(String text, int sizeSp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        if (bold) view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        return view;
    }

    private void showSetup() {
        showingSetup = true;
        if (webView != null) {
            ((ViewGroup) webView.getParent()).removeView(webView);
            webView.destroy();
            webView = null;
        }

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(247, 248, 251));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(24), dp(48), dp(24), dp(24));
        scroll.addView(root);

        TextView logo = titleView("滴答", 34, Color.rgb(79, 118, 246), true);
        root.addView(logo, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView subtitle = titleView(getString(R.string.setup_title), 20, Color.rgb(32, 37, 50), true);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dp(18);
        root.addView(subtitle, subtitleParams);

        TextView hint = titleView(getString(R.string.setup_hint), 13, Color.rgb(110, 118, 132), false);
        hint.setLineSpacing(dp(3), 1f);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(8);
        hintParams.bottomMargin = dp(22);
        root.addView(hint, hintParams);

        EditText urlInput = new EditText(this);
        urlInput.setHint(R.string.url_hint);
        urlInput.setSingleLine(false);
        urlInput.setText(prefs.getString(KEY_URL, DEFAULT_URL));
        urlInput.setTextSize(14);
        urlInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        urlInput.setPadding(dp(12), dp(12), dp(12), dp(12));
        root.addView(urlInput, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        EditText tokenInput = new EditText(this);
        tokenInput.setHint(R.string.token_hint);
        tokenInput.setSingleLine(true);
        tokenInput.setText(prefs.getString(KEY_TOKEN, DEFAULT_TOKEN));
        tokenInput.setTextSize(14);
        tokenInput.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout.LayoutParams tokenParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tokenParams.topMargin = dp(12);
        root.addView(tokenInput, tokenParams);

        Button connect = new Button(this);
        connect.setText(R.string.connect);
        connect.setTextSize(15);
        connect.setTextColor(Color.WHITE);
        connect.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(79, 118, 246)));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        buttonParams.topMargin = dp(18);
        root.addView(connect, buttonParams);

        TextView note = titleView("手机和电脑需要连接同一个 Wi-Fi；电脑端保持「启动滴答清单」运行。", 11, Color.rgb(140, 148, 160), false);
        note.setLineSpacing(dp(3), 1f);
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        noteParams.topMargin = dp(16);
        root.addView(note, noteParams);

        connect.setOnClickListener(v -> {
            String rawUrl = urlInput.getText().toString().trim();
            String rawToken = tokenInput.getText().toString().trim();
            if (rawUrl.isEmpty()) {
                Toast.makeText(this, "请填写电脑地址", Toast.LENGTH_SHORT).show();
                return;
            }
            if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
                rawUrl = "http://" + rawUrl;
            }
            Uri parsed = Uri.parse(rawUrl);
            String queryToken = parsed.getQueryParameter("token");
            if (queryToken != null && !queryToken.isEmpty()) rawToken = queryToken;
            String base = parsed.buildUpon().clearQuery().build().toString().replaceAll("/+$", "");
            prefs.edit().putString(KEY_URL, base).putString(KEY_TOKEN, rawToken).apply();
            hideKeyboard();
            loadApp(base, rawToken);
        });

        setContentView(scroll);
    }

    private void loadApp(String base, String token) {
        showingSetup = false;
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(247, 248, 251));
        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " DidaLocal/0.1");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUri(request.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this, "连接失败，请检查电脑是否开机、地址和访问码", Toast.LENGTH_LONG).show();
                }
            }
        });
        webView.setLongClickable(true);
        webView.setOnLongClickListener(v -> {
            showConnectionMenu();
            return true;
        });
        root.addView(webView);
        setContentView(root);

        String finalUrl = base;
        if (token != null && !token.isEmpty()) {
            finalUrl += "/?token=" + Uri.encode(token);
        }
        webView.loadUrl(finalUrl);
    }

    private boolean handleUri(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        if (scheme.equals("http") || scheme.equals("https") || scheme.equals("about") || scheme.equals("data")) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
        }
        return true;
    }

    private void showConnectionMenu() {
        new AlertDialog.Builder(this)
                .setTitle("连接")
                .setItems(new String[]{getString(R.string.refresh), getString(R.string.change_server), "在浏览器中打开"}, (dialog, which) -> {
                    if (which == 0 && webView != null) {
                        webView.reload();
                    } else if (which == 1) {
                        showSetup();
                    } else if (which == 2 && webView != null) {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(webView.getUrl())));
                    }
                })
                .show();
    }

    private void hideKeyboard() {
        View focus = getCurrentFocus();
        if (focus == null) return;
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(focus.getWindowToken(), 0);
    }

    @Override
    public void onBackPressed() {
        if (showingSetup) {
            super.onBackPressed();
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
