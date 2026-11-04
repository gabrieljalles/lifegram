package app.lifegram.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

/**
 * O widget da tela inicial. Troca de frase quando o celular bloqueia (com o
 * modo desbloqueio ligado), a cada 30 minutos e quando voce toca nele.
 */
public class PhraseWidget extends AppWidgetProvider {
    static final String ACTION_NEXT = "app.lifegram.widget.NEXT";

    /** Copia mais velha que isso e buscada de novo. */
    static final long STALE_MS = 15 * 60 * 1000L;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, Store.next(context));
        refreshIfStale(context, goAsync());
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_NEXT.equals(intent.getAction())) {
            render(context, Store.next(context));
            refreshIfStale(context, goAsync());
            return;
        }
        super.onReceive(context, intent);
    }

    /** Busca as frases novas em segundo plano, sem trocar a que esta na tela. */
    static void refreshIfStale(Context context, PendingResult pending) {
        Context app = context.getApplicationContext();
        if (Store.config(app) == null || System.currentTimeMillis() - Store.lastFetch(app) < STALE_MS) {
            if (pending != null) pending.finish();
            return;
        }
        new Thread(() -> {
            try {
                if (Api.fetch(app).ok) {
                    Store.Phrase now = Store.current(app);
                    render(app, now != null ? now : Store.next(app));
                }
            } finally {
                if (pending != null) pending.finish();
            }
        }).start();
    }

    static void showNext(Context context) {
        render(context, Store.next(context));
    }

    static void render(Context context, Store.Phrase phrase) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PhraseWidget.class));
        if (ids.length == 0) return;

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget);
        boolean connected = Store.config(context) != null;
        PendingIntent tap;
        if (phrase != null) {
            views.setTextViewText(R.id.text, phrase.text);
            if (phrase.author != null && !phrase.author.isEmpty()) {
                views.setTextViewText(R.id.author, "— " + phrase.author);
                views.setViewVisibility(R.id.author, View.VISIBLE);
            } else {
                views.setViewVisibility(R.id.author, View.GONE);
            }
            Intent next = new Intent(context, PhraseWidget.class).setAction(ACTION_NEXT);
            tap = PendingIntent.getBroadcast(context, 1, next,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        } else {
            views.setTextViewText(R.id.text, connected
                    ? "Suas frases aparecem aqui. Adicione em Coragem → Minhas frases no Lifegram."
                    : "Toque para conectar ao Lifegram.");
            views.setViewVisibility(R.id.author, View.GONE);
            Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            tap = PendingIntent.getActivity(context, 2, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }
        views.setOnClickPendingIntent(R.id.root, tap);
        manager.updateAppWidget(ids, views);
    }
}
