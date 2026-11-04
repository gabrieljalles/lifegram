package app.lifegram.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Tela unica do app: conectar ao Lifegram, ligar a troca ao desbloquear e por
 * o widget na tela inicial. Montada em codigo para nao precisar de bibliotecas.
 */
public class MainActivity extends Activity {
    private static final int INK_900 = 0xFF0B0F17;
    private static final int INK_800 = 0xFF161F2D;
    private static final int INK_300 = 0xFF94A3B8;
    private static final int INK_50 = 0xFFF5F8FC;
    private static final int BRAND = 0xFF6366F1;

    private TextView status;
    private EditText codeInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(INK_900);
        getWindow().setNavigationBarColor(INK_900);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), dp(28), dp(20), dp(28));

        col.addView(text("Lifegram Frases", 26, INK_50, true));
        col.addView(text("Suas frases do Lifegram na tela inicial, uma nova a cada desbloqueio.", 14, INK_300, false));

        status = text("", 15, INK_50, true);
        status.setPadding(dp(14), dp(12), dp(14), dp(12));
        status.setBackground(round(INK_800));
        col.addView(status, margins(0, 20, 0, 0));

        col.addView(title("1. Conectar"));
        col.addView(text("No Lifegram: Coragem → Minhas frases → Conectar widget. Depois toque em "
                + "\"Abrir no app do widget\". Se não abrir, toque em Copiar código lá e em "
                + "\"Colar e conectar\" aqui.", 13, INK_300, false));
        col.addView(button("Colar e conectar", v -> connect(clipboardText())), margins(0, 10, 0, 0));
        codeInput = new EditText(this);
        codeInput.setHint("Cole o código aqui");
        codeInput.setTextColor(INK_50);
        codeInput.setHintTextColor(INK_300);
        codeInput.setTextSize(13);
        codeInput.setSingleLine(true);
        // Sem corretor: o teclado nao pode mexer no codigo.
        codeInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        codeInput.setBackground(round(INK_800));
        codeInput.setPadding(dp(14), dp(12), dp(14), dp(12));
        col.addView(codeInput, margins(0, 10, 0, 0));
        col.addView(button("Conectar com o código", v -> connect(codeInput.getText().toString())), margins(0, 8, 0, 0));
        col.addView(button("Atualizar frases agora", v -> refresh()), margins(0, 8, 0, 0));

        col.addView(title("2. Trocar a cada desbloqueio"));
        Switch unlock = new Switch(this);
        unlock.setText("Frase nova toda vez que desbloquear");
        unlock.setTextColor(INK_50);
        unlock.setChecked(Store.unlockMode(this));
        unlock.setOnCheckedChangeListener((b, on) -> {
            Store.setUnlockMode(this, on);
            if (on) UnlockService.start(this);
            else UnlockService.stop(this);
        });
        col.addView(unlock, margins(0, 4, 0, 0));
        col.addView(text("O Android só avisa o desbloqueio para apps abertos, por isso fica uma notificação "
                + "discreta. Pode silenciá-la segurando nela. Desligado, a frase troca a cada 30 minutos "
                + "e quando você toca no widget.", 12, INK_300, false));

        col.addView(title("3. Colocar na tela inicial"));
        col.addView(button("Adicionar o widget", v -> pinWidget()), margins(0, 4, 0, 0));
        col.addView(text("Ou segure num espaço vazio da tela inicial → Widgets → Lifegram Frases.", 12, INK_300, false));

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(INK_900);
        scroll.setFitsSystemWindows(true);
        scroll.addView(col);
        setContentView(scroll);

        handleLink(getIntent());
        showStatus(null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleLink(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        UnlockService.start(this);
    }

    private void handleLink(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"lifegram-widget".equals(data.getScheme())) return;
        connect(data.getQueryParameter("c"));
    }

    private void connect(String code) {
        if (code == null || code.trim().isEmpty()) {
            say("Nada para conectar: copie o código no Lifegram primeiro.");
            return;
        }
        if (!Store.saveSetupCode(this, Store.extractCode(code))) {
            say("Código inválido. Gere um novo no Lifegram, copie e tente de novo.");
            return;
        }
        codeInput.setText("");
        showStatus("Conectando…");
        refresh();
        UnlockService.start(this);
    }

    private void refresh() {
        showStatus("Buscando suas frases…");
        new Thread(() -> {
            Api.Result result = Api.fetch(getApplicationContext());
            if (result.ok) PhraseWidget.showNext(getApplicationContext());
            runOnUiThread(() -> say(result.message));
        }).start();
    }

    /** Mostra no quadro de status e num aviso rapido, para nunca passar batido. */
    private void say(String message) {
        showStatus(message);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private String clipboardText() {
        ClipboardManager cm = getSystemService(ClipboardManager.class);
        ClipData clip = cm == null ? null : cm.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return null;
        CharSequence text = clip.getItemAt(0).coerceToText(this);
        return text == null ? null : text.toString();
    }

    private void showStatus(String message) {
        boolean connected = Store.config(this) != null;
        int count = Store.phrases(this).size();
        String base = !connected
                ? "Ainda não conectado ao Lifegram."
                : "Conectado · " + count + (count == 1 ? " frase guardada" : " frases guardadas");
        status.setText(message == null ? base : base + "\n" + message);
    }

    private void pinWidget() {
        AppWidgetManager manager = getSystemService(AppWidgetManager.class);
        if (manager != null && manager.isRequestPinAppWidgetSupported()) {
            manager.requestPinAppWidget(new ComponentName(this, PhraseWidget.class), null, null);
        } else {
            say("Seu celular não deixa adicionar por aqui: use o caminho pelos Widgets da tela inicial.");
        }
    }

    // --- pecas da tela ---

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setLineSpacing(0, 1.15f);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(4), 0, 0);
        return t;
    }

    private TextView title(String value) {
        TextView t = text(value, 17, INK_50, true);
        t.setPadding(0, dp(26), 0, dp(2));
        return t;
    }

    private Button button(String label, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setGravity(Gravity.CENTER);
        b.setBackground(round(BRAND));
        b.setOnClickListener(onClick);
        return b;
    }

    private GradientDrawable round(int color) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(14));
        return d;
    }

    private LinearLayout.LayoutParams margins(int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.setMargins(dp(l), dp(t), dp(r), dp(b));
        return p;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
