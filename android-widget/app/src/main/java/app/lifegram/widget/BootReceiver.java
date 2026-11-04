package app.lifegram.widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Liga de novo a troca ao desbloquear depois de reiniciar ou atualizar o app. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        UnlockService.start(context);
    }
}
