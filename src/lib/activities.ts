import { addDays, format, parseISO } from 'date-fns'
import type { Activity, ActivityLog, Weekday } from './types'

/**
 * Agenda de atividades: recorrentes (dias da semana) e esporadicas (uma data).
 *
 * Tudo aqui e puro — recebe as linhas e o "agora" — para a tela Hoje, a
 * agenda e os testes calcularem exatamente a mesma coisa.
 */

/** XP por atividade cumprida. Esporadica vale mais: costuma ser mais rara. */
export const ACTIVITY_XP: Record<Activity['kind'], number> = {
  recorrente: 20,
  esporadica: 40,
}

/** Corrente desse tamanho dobra o XP da recorrente: o combo. */
export const COMBO_AT = 7

export const ACTIVITY_ICONS = ['📖', '🧘', '💧', '🏃', '🎸', '🧠', '✍️', '🧹', '💊', '📞', '🦷', '⭐']

export const dayKey = (date: Date): string => format(date, 'yyyy-MM-dd')

/** Ignora `archived` de proposito: a corrente antiga continua valendo XP. */
export function occursOn(activity: Activity, date: Date): boolean {
  const key = dayKey(date)
  if (activity.kind === 'esporadica') return activity.date === key
  return key >= activity.starts_on && activity.days.includes(date.getDay() as Weekday)
}

/** Instante marcado da ocorrencia, ou null quando e "qualquer hora". */
export function occurrenceAt(activity: Activity, date: Date): Date | null {
  if (!activity.time) return null
  const [h, m] = activity.time.split(':').map(Number)
  const at = new Date(date)
  at.setHours(h, m, 0, 0)
  return at
}

const doneSet = (logs: ActivityLog[]) => new Set(logs.map((l) => `${l.activity_id}|${l.day}`))

export function logFor(logs: ActivityLog[], activityId: string, day: string) {
  return logs.find((l) => l.activity_id === activityId && l.day === day)
}

export interface Occurrence {
  activity: Activity
  /** Dia da ocorrencia (YYYY-MM-DD). */
  day: string
  at: Date | null
  done: boolean
  /** Horario ja passou e nao foi feita. */
  late: boolean
}

/** Ocorrencias de um dia: com horario primeiro, na ordem do relogio. */
export function agendaOf(
  activities: Activity[],
  logs: ActivityLog[],
  date: Date,
  now = new Date(),
): Occurrence[] {
  const done = doneSet(logs)
  const day = dayKey(date)
  return activities
    .filter((a) => !a.archived && occursOn(a, date))
    .map((activity) => {
      const at = occurrenceAt(activity, date)
      const isDone = done.has(`${activity.id}|${day}`)
      return {
        activity,
        day,
        at,
        done: isDone,
        late: !isDone && (at ? at < now : day < dayKey(now)),
      }
    })
    .sort((a, b) => {
      if (a.at && b.at) return a.at.getTime() - b.at.getTime()
      if (a.at) return -1
      if (b.at) return 1
      return a.activity.title.localeCompare(b.activity.title, 'pt-BR')
    })
}

/**
 * A proxima coisa a fazer. Hoje primeiro (atrasada inclusa: ela ainda pode
 * ser salva), depois o primeiro dia com algo marcado nas proximas semanas.
 */
export function nextOccurrence(
  activities: Activity[],
  logs: ActivityLog[],
  now = new Date(),
  horizonDays = 30,
): Occurrence | null {
  for (let offset = 0; offset <= horizonDays; offset++) {
    const date = addDays(now, offset)
    const open = agendaOf(activities, logs, date, now).filter((o) => !o.done)
    if (open.length > 0) return open[0]
  }
  return null
}

/**
 * Corrente da recorrente: ocorrencias seguidas cumpridas, de tras para frente.
 * Hoje so entra se ja foi feita — o dia ainda nao acabou, entao nao quebra.
 */
export function streakOf(activity: Activity, logs: ActivityLog[], now = new Date()): number {
  if (activity.kind !== 'recorrente' || activity.days.length === 0) return 0
  const done = doneSet(logs.filter((l) => l.activity_id === activity.id))
  let streak = 0
  let date = new Date(now)
  if (!done.has(`${activity.id}|${dayKey(date)}`)) date = addDays(date, -1)
  // Teto de um ano: protege o laco de datas de inicio absurdas.
  for (let i = 0; i < 366; i++, date = addDays(date, -1)) {
    if (dayKey(date) < activity.starts_on) break
    if (!occursOn(activity, date)) continue
    if (!done.has(`${activity.id}|${dayKey(date)}`)) break
    streak++
  }
  return streak
}

/** XP de uma execucao: dobra quando ela fecha ou estende um combo. */
export function xpForLog(activity: Activity, streakAtLog: number): number {
  const base = ACTIVITY_XP[activity.kind]
  return activity.kind === 'recorrente' && streakAtLog >= COMBO_AT ? base * 2 : base
}

/** XP que esta ocorrencia vale (ou valeu): a feita ja conta na corrente. */
export function xpOf(occ: Occurrence, streak: number): number {
  return xpForLog(occ.activity, occ.done ? streak : streak + 1)
}

/** XP total das atividades, e quanto disso entrou hoje. */
export function activityXP(
  activities: Activity[],
  logs: ActivityLog[],
  now = new Date(),
): { total: number; today: number } {
  const byId = new Map(activities.map((a) => [a.id, a]))
  const todayKey = dayKey(now)
  let total = 0
  let today = 0
  for (const log of logs) {
    const activity = byId.get(log.activity_id)
    if (!activity) continue
    const streak = streakOf(activity, logs, parseISO(log.day))
    const xp = xpForLog(activity, streak)
    total += xp
    if (log.day === todayKey) today += xp
  }
  return { total, today }
}

/* --------------------------------------------------------------- textos */

const SHORT: Record<Weekday, string> = {
  0: 'dom',
  1: 'seg',
  2: 'ter',
  3: 'qua',
  4: 'qui',
  5: 'sex',
  6: 'sáb',
}

/** "Todo dia", "Seg a sex", "Seg, qua, sex"... */
export function describeDays(days: Weekday[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  const key = sorted.join(',')
  if (key === '0,1,2,3,4,5,6') return 'Todo dia'
  if (key === '1,2,3,4,5') return 'Seg a sex'
  if (key === '0,6') return 'Fim de semana'
  const text = sorted.map((d) => SHORT[d]).join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function describeWhen(activity: Activity): string {
  const time = activity.time ?? 'qualquer hora'
  if (activity.kind === 'recorrente') return `${describeDays(activity.days)} · ${time}`
  const date = activity.date ? format(parseISO(activity.date), 'dd/MM') : '—'
  return `${date} · ${time}`
}

/** "em 25 min", "há 2 h", "amanhã 07:00"... — para o card da proxima. */
export function relativeLabel(occ: Occurrence, now = new Date()): string {
  const todayKey = dayKey(now)
  if (occ.day === todayKey) {
    if (!occ.at) return 'hoje, qualquer hora'
    const diff = Math.round((occ.at.getTime() - now.getTime()) / 60000)
    if (diff < -59) return `atrasada · era ${occ.activity.time}`
    if (diff < 0) return `atrasada há ${-diff} min`
    if (diff === 0) return 'agora'
    if (diff < 60) return `em ${diff} min`
    return `hoje às ${occ.activity.time}`
  }
  const tomorrow = dayKey(addDays(now, 1))
  const when = occ.day === tomorrow ? 'amanhã' : format(parseISO(occ.day), 'dd/MM')
  return occ.activity.time ? `${when} às ${occ.activity.time}` : when
}
