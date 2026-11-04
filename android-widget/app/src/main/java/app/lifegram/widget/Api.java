package app.lifegram.widget;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Busca suas frases no Supabase, so leitura, pela funcao widget_phrases. */
final class Api {
    private Api() {}

    /** Resultado legivel para a tela do app. */
    static final class Result {
        final boolean ok;
        final String message;

        Result(boolean ok, String message) {
            this.ok = ok;
            this.message = message;
        }
    }

    /** Roda na thread de quem chama: nunca chamar na thread principal. */
    static Result fetch(Context c) {
        Store.Config cfg = Store.config(c);
        if (cfg == null) return new Result(false, "Ainda não conectado.");
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(cfg.url + "/rest/v1/rpc/widget_phrases").openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("apikey", cfg.key);
            // A anon key antiga (JWT) tambem vai como Bearer; a publishable nova so no apikey.
            if (cfg.key.startsWith("eyJ")) conn.setRequestProperty("Authorization", "Bearer " + cfg.key);
            byte[] body = new JSONObject().put("p_token", cfg.token).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body);
            }
            int status = conn.getResponseCode();
            String text = read(status >= 400 ? conn.getErrorStream() : conn.getInputStream());
            if (status == 404) {
                return new Result(false, "Falta rodar a migração 016_widget.sql no Supabase.");
            }
            if (status >= 400) return new Result(false, "Erro " + status + " do servidor.");
            JSONArray arr = new JSONArray(text);
            Store.savePhrases(c, arr);
            if (arr.length() == 0) {
                return new Result(true, "Conectado, mas nenhuma frase chegou. Use o código mais novo e "
                        + "confira se as frases já sincronizaram no Lifegram.");
            }
            return new Result(true, arr.length() + (arr.length() == 1 ? " frase" : " frases") + " no widget.");
        } catch (Exception e) {
            return new Result(false, "Sem internet agora. O widget usa a última cópia.");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream s = in) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = s.read(chunk)) > 0) buf.write(chunk, 0, n);
            return buf.toString("UTF-8");
        }
    }
}
