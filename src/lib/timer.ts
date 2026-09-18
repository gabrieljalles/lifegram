import { useEffect, useRef, useState } from 'react'

/* ----------------------------------------------------------------- som */

let audioCtx: AudioContext | null = null

type AudioCtor = typeof AudioContext

function ctor(): AudioCtor | undefined {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  return w.AudioContext ?? w.webkitAudioContext
}

/**
 * iOS/Android so deixam tocar audio depois de um toque do usuario. Chamamos
 * isso no botao de iniciar treino, para que o apito do fim do descanso
 * funcione mesmo com o celular no bolso.
 */
export function unlockAudio() {
  const Ctx = ctor()
  if (!Ctx) return
  if (!audioCtx) audioCtx = new Ctx()
  if (audioCtx.state === 'suspended') void audioCtx.resume()

  const buffer = audioCtx.createBuffer(1, 1, 22050)
  const source = audioCtx.createBufferSource()
  source.buffer = buffer
  source.connect(audioCtx.destination)
  source.start(0)
}

function tone(frequency: number, startAt: number, duration: number, gainValue = 0.22) {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frequency

  // Envelope curto: sem a rampa, o alto-falante estala no corte.
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.02)
}

/** Bipe curto da contagem regressiva final (3, 2, 1). */
export function beepTick() {
  if (!audioCtx) return
  tone(660, audioCtx.currentTime, 0.09, 0.14)
}

/** Sinal de fim de descanso: tres notas subindo, para ouvir de longe. */
export function beepDone() {
  if (!audioCtx) return
  const t = audioCtx.currentTime
  tone(784, t, 0.14)
  tone(988, t + 0.16, 0.14)
  tone(1319, t + 0.32, 0.3)
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      // Safari/iOS nao suporta: o bipe ja cobre o aviso.
    }
  }
}

/* ------------------------------------------- manter o app vivo no bolso */

let keepAliveEl: HTMLAudioElement | null = null
let silentURL: string | null = null

/** Gera, na memoria, um WAV de 1 segundo de silencio — sem arquivo externo. */
function silentWavURL(): string {
  if (silentURL) return silentURL

  const sampleRate = 8000
  const samples = sampleRate // 1 segundo
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples * 2, true)
  // As amostras ficam em zero: silencio puro.

  silentURL = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
  return silentURL
}

/**
 * Toca um silencio em loop durante o descanso.
 *
 * Nao e gambiarra gratuita: o navegador congela os temporizadores de uma aba
 * em segundo plano, mas NAO congela uma pagina que esta reproduzindo midia.
 * E isso que faz o alarme tocar com a tela apagada e o celular no bolso.
 */
export function startKeepAlive() {
  try {
    if (!keepAliveEl) {
      keepAliveEl = new Audio(silentWavURL())
      keepAliveEl.loop = true
      keepAliveEl.volume = 0.001
      keepAliveEl.setAttribute('playsinline', 'true')
    }
    void keepAliveEl.play().catch(() => {
      // Sem gesto previo do usuario o navegador recusa: seguimos sem isso.
    })
  } catch {
    // Ambiente sem suporte a audio: o app continua funcionando normalmente.
  }
}

export function stopKeepAlive() {
  try {
    keepAliveEl?.pause()
  } catch {
    // ignorado
  }
}

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

/** Dispara os bipes de 3/2/1 e o sinal final, cada um uma unica vez. */
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
      beepTick()
      vibrate(40)
    }
    if (remaining <= 0 && !finished.current) {
      finished.current = true
      beepDone()
      vibrate([120, 80, 120, 80, 220])
    }
  }, [remaining, active])
}
