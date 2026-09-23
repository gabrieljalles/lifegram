import { useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------- vibracao */

/**
 * O app nao toca som nenhum de proposito: qualquer audio, ate um bipe curto,
 * rouba o foco de audio do sistema e abaixa a musica de quem treina ouvindo
 * algo. O aviso de descanso fica por conta da vibracao e da notificacao.
 */
export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      // Safari/iOS nao suporta: sobra a notificacao do sistema.
    }
  }
}

/*
 * Aqui existia um truque de manter o app vivo tocando um WAV silencioso em
 * loop durante o descanso: navegador nao congela pagina que toca midia, entao
 * o alarme sobrevivia com a tela apagada. Foi removido de proposito — mesmo
 * mudo, reproduzir midia toma o foco de audio do sistema e abaixa a musica.
 * Em troca, o aviso de fim de descanso pode atrasar com o app em segundo
 * plano; a notificacao continua sendo o caminho para avisar de fora da tela.
 */

/* --------------------------------------------------------- notificacoes */

export const NOTIFY_KEY = 'notify_rest'

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/**
 * Avisa que o descanso acabou.
 *
 * So faz sentido quando a tela nao esta a vista — com o app aberto, o bipe e a
 * vibracao ja cumprem o papel sem roubar o foco.
 */
export async function notifyRestFinished(body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return

  const options: NotificationOptions = {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    // A mesma tag substitui o aviso anterior em vez de empilhar avisos.
    tag: 'rest-timer',
    requireInteraction: false,
    silent: false,
  }

  try {
    // Pelo service worker o aviso sobrevive melhor em segundo plano.
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification('Descanso terminado', options)
      return
    }
  } catch {
    // cai no caminho simples abaixo
  }

  try {
    new Notification('Descanso terminado', options)
  } catch {
    // Alguns navegadores so permitem via service worker: sem aviso, entao.
  }
}

/* ------------------------------------------------------------ wake lock */

interface WakeLockSentinelLike {
  release: () => Promise<void>
  released: boolean
}

let sentinel: WakeLockSentinelLike | null = null

/** Mantem a tela acesa durante o treino. Silencioso onde nao ha suporte. */
export async function keepScreenAwake() {
  const nav = navigator as unknown as {
    wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
  }
  if (!nav.wakeLock) return
  try {
    sentinel = await nav.wakeLock.request('screen')
  } catch {
    // Negado (bateria fraca, aba em background): seguimos sem isso.
  }
}

export async function releaseScreenAwake() {
  try {
    if (sentinel && !sentinel.released) await sentinel.release()
  } catch {
    // ignorado
  }
  sentinel = null
}

/**
 * O bloqueio cai sozinho quando o app vai para background. Ao voltar,
 * pedimos de novo — sem isso a tela apaga no meio da segunda serie.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return

    void keepScreenAwake()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void keepScreenAwake()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      void releaseScreenAwake()
    }
  }, [active])
}

/* ------------------------------------------------------------ contagem */

/**
 * Contagem regressiva ancorada em `endsAt` (timestamp absoluto em ms).
 *
 * Nunca decrementa um contador: a cada quadro recalculamos a diferenca para o
 * relogio. E por isso que o descanso continua correto depois de bloquear a
 * tela, trocar de app ou o navegador congelar os timers da aba.
 */
export function useCountdown(endsAt: number | null, onDone?: () => void) {
  const [remaining, setRemaining] = useState(() =>
    endsAt ? Math.max(0, (endsAt - Date.now()) / 1000) : 0,
  )
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    doneRef.current = false
    if (!endsAt) {
      setRemaining(0)
      return
    }

    let frame = 0
    const tick = () => {
      const left = Math.max(0, (endsAt - Date.now()) / 1000)
      setRemaining(left)
      if (left <= 0) {
        if (!doneRef.current) {
          doneRef.current = true
          onDoneRef.current?.()
        }
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    // requestAnimationFrame para em background; ao voltar, reavaliamos na hora.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(tick)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [endsAt])

  return remaining
}

/**
 * Tempo decorrido desde um instante ISO, atualizado a cada segundo.
 * Tambem ancorado no relogio: voltar de segundo plano nao perde tempo.
 */
export function useElapsed(sinceISO: string | null | undefined): number {
  const [seconds, setSeconds] = useState(() =>
    sinceISO ? Math.max(0, (Date.now() - new Date(sinceISO).getTime()) / 1000) : 0,
  )

  useEffect(() => {
    if (!sinceISO) {
      setSeconds(0)
      return
    }
    const start = new Date(sinceISO).getTime()
    const tick = () => setSeconds(Math.max(0, (Date.now() - start) / 1000))

    tick()
    const id = window.setInterval(tick, 1000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [sinceISO])

  return seconds
}

/** Vibra em 3/2/1 e no fim do descanso, cada um uma unica vez. */
export function useCountdownFeedback(remaining: number, active: boolean) {
  const lastTick = useRef<number | null>(null)
  const finished = useRef(false)

  useEffect(() => {
    if (!active) {
      lastTick.current = null
      finished.current = false
      return
    }

    const seconds = Math.ceil(remaining)
    if (seconds > 0 && seconds <= 3 && lastTick.current !== seconds) {
      lastTick.current = seconds
      vibrate(40)
    }
    if (remaining <= 0 && !finished.current) {
      finished.current = true
      vibrate([120, 80, 120, 80, 220])
    }
  }, [remaining, active])
}
