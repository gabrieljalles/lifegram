# Lifegram Frases (widget Android)

App Android mínimo, só com o SDK e sem bibliotecas. Ele mostra uma das frases de **Coragem → Minhas frases** na tela inicial do celular.

## Quando a frase troca

A frase troca:

- quando a tela apaga, para que a próxima já esteja lá ao desbloquear;
- quando você toca no widget;
- a cada 30 minutos.

Para trocar ao desbloquear, o app mantém um serviço com uma notificação discreta. É a única forma de o Android avisar sobre o desbloqueio.

## Como ele lê as frases

O app não faz login. O Lifegram gera um código: base64url de `{u, k, t}`, ou seja, URL do Supabase, chave pública e token.

O app chama a função `widget_phrases(p_token)` da migração `016_widget.sql`. No banco fica só o sha256 do token.

## Compilar

Precisa de JDK 17 e do Android SDK (platform 35) com `ANDROID_HOME` apontando para ele.

```sh
./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../public/lifegram-widget.apk
```

O APK é assinado com a chave de debug da máquina que compilou. Um APK compilado em outra máquina não instala por cima do atual: é preciso desinstalar e conectar de novo.
