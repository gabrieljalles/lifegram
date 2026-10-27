import { addDays, addMinutes, format } from 'date-fns'
import { dayKey, logFor, occurrenceAt, occursOn } from './activities'
import type { Activity, ActivityLog } from './types'

/**
 * Avisos da agenda.
 *
 * O aviso nao mira o horario do compromisso, e sim a hora de SAIR: horario
 * menos o deslocamento menos uma folga. Sem deslocamento, e so a folga antes
 * de comecar. Tudo puro (recebe as linhas e o "agora") para os testes e o
 * agendador do app calcularem a mesma coisa.
 */

/** Folga antes de sair (ou de comecar): da tempo de largar o que esta fazendo. */
export const REMINDER_LEAD_MINUTES = 5

/** Opcoes de deslocamento no formulario, em minutos. 0 = ja esta no lugar. */
export const TRAVEL_OPTIONS = [0, 10, 15, 20, 30, 45, 60, 90]

export const travelOf = (activity: Pick<Activity, 'travel_minutes'>): number =>
  activity.travel_minutes ?? 0

/** Minutos de antecedencia do aviso em relacao ao horario marcado. */
export const reminderOffset = (activity: Pick<Activity, 'travel_minutes'>): number =>
  travelOf(activity) + REMINDER_LEAD_MINUTES

export const formatTravel = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Os tres marcos de um compromisso: aviso, saida e chegada. */
export interface ReminderPlan {
  notifyAt: Date
  /** Hora de sair; null quando nao ha deslocamento. */
  leaveAt: Date | null
  startAt: Date
}

export function reminderPlan(activity: Activity, date: Date): ReminderPlan | null {
  const startAt = occurrenceAt(activity, date)
  if (!startAt) return null
  const travel = travelOf(activity)
  return {
    notifyAt: addMinutes(startAt, -reminderOffset(activity)),
    leaveAt: travel > 0 ? addMinutes(startAt, -travel) : null,
    startAt,
  }
}

/** Texto da notificacao: o titulo diz o que e quando, o corpo diz o que fazer. */
export function reminderText(activity: Activity, plan: ReminderPlan): { title: string; body: string } {
  const title = `${activity.icon} ${activity.title} às ${format(plan.startAt, 'HH:mm')}`
  const travel = travelOf(activity)
  const body =
    travel > 0
      ? `Saia em ${REMINDER_LEAD_MINUTES} min (às ${format(plan.leaveAt!, 'HH:mm')}) — são ~${formatTravel(travel)} até lá.`
      : `Começa em ${REMINDER_LEAD_MINUTES} min.`
  return { title, body }
}

export interface PendingReminder {
  /** Chave unica da ocorrencia: impede avisar duas vezes o mesmo compromisso. */
  key: string
  notifyAt: Date
  title: string
  body: string
}

/**
 * Avisos de hoje e amanha que ainda fazem sentido: o compromisso nao comecou,
 * nao foi marcado como feito e o aviso cai dentro de `horizonMs`. Aviso cuja
 * hora ja passou mas o compromisso ainda nao comecou entra tambem — o app
 * estava fechado na hora certa, e avisar atrasado ainda e melhor que nada.
 */
export function pendingReminders(
  activities: Activity[],
  logs: ActivityLog[],
  now = new Date(),
  horizonMs = 24 * 60 * 60 * 1000,
): PendingReminder[] {
  const result: PendingReminder[] = []
  for (const date of [now, addDays(now, 1)]) {
    const day = dayKey(date)
    for (const activity of activities) {
      if (activity.archived || !activity.time || !occursOn(activity, date)) continue
      if (logFor(logs, activity.id, day)) continue
      const plan = reminderPlan(activity, date)
      if (!plan || plan.startAt <= now) continue
      if (plan.notifyAt.getTime() - now.getTime() > horizonMs) continue
      result.push({
        key: `${activity.id}|${day}|${activity.time}|${travelOf(activity)}`,
        notifyAt: plan.notifyAt,
        ...reminderText(activity, plan),
      })
    }
  }
  return result.sort((a, b) => a.notifyAt.getTime() - b.notifyAt.getTime())
}
