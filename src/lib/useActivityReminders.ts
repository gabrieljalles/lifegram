import { useEffect, useState } from 'react'
import { gcalLinked } from './gcal'
import { pendingReminders, type PendingReminder } from './reminders'
import { notificationPermission } from './timer'
import type { Activity, ActivityLog } from './types'

/**
 * Quem entrega o aviso da agenda neste aparelho:
 * - google: o evento espelhado tem lembrete proprio e o celular avisa mesmo
 *   com o app fechado. O app nao avisa junto para nao chegar em dobro.
 * - app: o proprio app agenda o aviso. Com ele fechado, o sistema pode
 *   congelar a pagina e o aviso atrasa (ou sai assim que voce abrir).
 * - ask: falta liberar as notificacoes.
 * - blocked: o navegador bloqueou ou nao suporta.
 */
export type ReminderChannel = 'google' | 'app' | 'ask' | 'blocked'

export function reminderChannel(): ReminderChannel {
  if (gcalLinked()) return 'google'
  const permission = notificationPermission()
  if (permission === 'granted') return 'app'
  if (permission === 'default') return 'ask'
  return 'blocked'
}

const FIRED_KEY = 'reminders:fired'

function readFired(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function markFired(key: string) {
  try {
    // So as ultimas: a chave inclui o dia, entao as antigas nunca voltam.
    const list = [...readFired().filter((k) => k !== key), key].slice(-200)
    localStorage.setItem(FIRED_KEY, JSON.stringify(list))
  } catch {
    // Sem storage: no pior caso o mesmo aviso sai de novo ao reabrir.
  }
}

async function show(reminder: PendingReminder) {
  if (readFired().includes(reminder.key)) return
  markFired(reminder.key)
  const options: NotificationOptions & { renotify?: boolean } = {
    body: reminder.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: `agenda:${reminder.key}`,
    renotify: true,
    requireInteraction: true,
    data: { url: '/agenda' },
  }
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) return void (await registration.showNotification(reminder.title, options))
  } catch {
    // cai no caminho simples abaixo
  }
  try {
    new Notification(reminder.title, options)
  } catch {
    // Navegador que so aceita via service worker: sem aviso.
  }
}

/**
 * Agenda os avisos das proximas 24 h enquanto o app esta vivo. Recalcula a
 * cada mudanca na agenda e sempre que o app volta para a frente — e ai que
 * sai o aviso que o sistema segurou com o app em segundo plano.
 */
export function useActivityReminders(activities: Activity[], logs: ActivityLog[]) {
  const [wake, setWake] = useState(0)

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setWake((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (reminderChannel() !== 'app') return
    const now = Date.now()
    const timers = pendingReminders(activities, logs, new Date(now)).map((reminder) =>
      window.setTimeout(() => void show(reminder), Math.max(0, reminder.notifyAt.getTime() - now)),
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [activities, logs, wake])
}
