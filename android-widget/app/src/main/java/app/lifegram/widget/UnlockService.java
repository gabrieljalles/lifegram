package app.lifegram.widget;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Fica vivo so para ouvir a tela apagar e o desbloqueio. A frase troca quando
 * a tela apaga: ao desbloquear, a nova ja esta la esperando.
 */
public class UnlockService extends Service {
    private static final String CHANNEL = "unlock";
    private BroadcastReceiver receiver;

    static void start(Context context) {
        if (!Store.unlockMode(context) || Store.config(context) == null) return;
        try {
            context.startForegroundService(new Intent(context, UnlockService.class));
        } catch (RuntimeException ignored) {
            // o sistema recusou iniciar em segundo plano: tenta de novo ao abrir o app
        }
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, UnlockService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Troca ao desbloquear",
                NotificationManager.IMPORTANCE_MIN);
        channel.setDescription("Mantém o widget trocando de frase. Pode silenciar à vontade.");
        channel.setShowBadge(false);
        nm.createNotificationChannel(channel);

        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_launcher_fg)
                .setContentTitle("Frase nova a cada desbloqueio")
                .setContentIntent(open)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(1, notification);
        }

        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
                    PhraseWidget.showNext(context);
                } else {
                    PhraseWidget.refreshIfStale(context, null);
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(receiver, filter);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (receiver != null) unregisterReceiver(receiver);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
