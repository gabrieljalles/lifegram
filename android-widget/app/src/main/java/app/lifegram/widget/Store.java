package app.lifegram.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Tudo que o widget guarda: o codigo de conexao e a copia das suas frases. */
final class Store {
    private Store() {}

    static final class Phrase {
        final String id;
        final String text;
        final String author;

        Phrase(String id, String text, String author) {
            this.id = id;
            this.text = text;
            this.author = author;
        }
    }

    static final class Config {
        final String url;
        final String key;
        final String token;

        Config(String url, String key, String token) {
            this.url = url;
            this.key = key;
            this.token = token;
        }
    }

    private static final Random RANDOM = new Random();

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("lifegram", Context.MODE_PRIVATE);
    }

    static Config config(Context c) {
        SharedPreferences p = prefs(c);
        String url = p.getString("url", null);
        String key = p.getString("key", null);
        String token = p.getString("token", null);
        if (url == null || key == null || token == null) return null;
        return new Config(url, key, token);
    }

    /**
     * Acha o codigo no que foi colado: o codigo puro, o link inteiro
     * (lifegram-widget://setup?c=...) ou com espacos e quebras no meio.
     */
    static String extractCode(String pasted) {
        String compact = pasted.replaceAll("\\s+", "");
        int at = compact.indexOf("c=");
        if (at >= 0) compact = compact.substring(at + 2);
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("eyJ[A-Za-z0-9_-]+").matcher(compact);
        return m.find() ? m.group() : compact;
    }

    /** O codigo do Lifegram: JSON {u, k, t} em base64url. */
    static boolean saveSetupCode(Context c, String code) {
        if (code == null) return false;
        try {
            String clean = code.trim().replaceAll("\\s+", "");
            byte[] raw = Base64.decode(clean, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            JSONObject o = new JSONObject(new String(raw, StandardCharsets.UTF_8));
            String url = o.getString("u").replaceAll("/+$", "");
            String key = o.getString("k");
            String token = o.getString("t");
            if (!url.startsWith("https://") || key.isEmpty() || token.isEmpty()) return false;
            prefs(c).edit()
                    .putString("url", url)
                    .putString("key", key)
                    .putString("token", token)
                    .putLong("lastFetch", 0)
                    .apply();
            return true;
        } catch (IllegalArgumentException | JSONException e) {
            return false;
        }
    }

    static List<Phrase> phrases(Context c) {
        List<Phrase> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs(c).getString("phrases", "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                String author = o.isNull("author") ? null : o.optString("author", null);
                list.add(new Phrase(o.getString("id"), o.getString("text"), author));
            }
        } catch (JSONException ignored) {
            // copia corrompida: fica vazia ate a proxima atualizacao
        }
        return list;
    }

    /** Guarda a resposta da funcao widget_phrases como veio. */
    static void savePhrases(Context c, JSONArray raw) {
        prefs(c).edit()
                .putString("phrases", raw.toString())
                .putLong("lastFetch", System.currentTimeMillis())
                .apply();
    }

    static long lastFetch(Context c) {
        return prefs(c).getLong("lastFetch", 0);
    }

    static boolean unlockMode(Context c) {
        return prefs(c).getBoolean("unlockMode", true);
    }

    static void setUnlockMode(Context c, boolean on) {
        prefs(c).edit().putBoolean("unlockMode", on).apply();
    }

    /** A frase na tela agora (ou null se ela foi apagada). */
    static Phrase current(Context c) {
        String id = prefs(c).getString("current", null);
        for (Phrase p : phrases(c)) if (p.id.equals(id)) return p;
        return null;
    }

    /** Sorteia a proxima, nunca a mesma duas vezes seguidas. */
    static Phrase next(Context c) {
        List<Phrase> all = phrases(c);
        if (all.isEmpty()) return null;
        String last = prefs(c).getString("current", null);
        List<Phrase> pool = new ArrayList<>();
        for (Phrase p : all) if (all.size() == 1 || !p.id.equals(last)) pool.add(p);
        Phrase pick = pool.get(RANDOM.nextInt(pool.size()));
        prefs(c).edit().putString("current", pick.id).apply();
        return pick;
    }
}
