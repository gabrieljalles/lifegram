import { format, parseISO } from 'date-fns'
import { stageToday } from './rejections'
import { routinesForDay } from './stats'
import { CARISMA, currentStepId, didToday, flatSteps } from './tracks'
import { FUNNEL_XP, XP_RULES } from './xp'
import type {
  AppSettings,
  CourageRejection,
  CourageTrackStep,
  Routine,
  Session,
  Weekday,
} from './types'

/**
 * Missoes do dia: no maximo tres coisas pequenas e claras. A ideia e tirar a
 * decisao do caminho — abrir o app e ja saber o que fazer hoje.
 */

/** Nãos por dia: pouco o bastante para caber num dia normal. */
export const DAILY_NAOS = 3

export interface Mission {
  id: 'treino' | 'descanso' | 'naos' | 'trilha'
  icon: string
  title: string
  detail: string
  done: boolean
  xp: number
  /** Missao que nao cobra: dia livre na agenda. */
  optional?: boolean
  progress?: { value: number; target: number }
  /** Treino sugerido para o botao de comecar. */
  routine?: Routine
  /** Para onde o card leva. */
  to: string
}

export interface MissionInput {
  routines: Routine[]
  sessions: Array<Pick<Session, 'started_at' | 'finished_at' | 'routine_id'>>
  settings: Pick<AppSettings, 'rest_days'>
  rejections: CourageRejection[]
  trackSteps: CourageTrackStep[]
}

export function dailyMissions(input: MissionInput, now = new Date()): Mission[] {
  const weekday = now.getDay() as Weekday
  const todayKey = format(now, 'yyyy-MM-dd')
  const trainedToday = input.sessions.some(
    (s) => s.finished_at && format(parseISO(s.started_at), 'yyyy-MM-dd') === todayKey,
  )

  const missions: Mission[] = []

  if (input.settings.rest_days.includes(weekday) && !trainedToday) {
    missions.push({
      id: 'descanso',
      icon: '😴',
      title: 'Dia de descanso',
      detail: 'O músculo cresce na recuperação. Hoje a missão é não treinar.',
      done: true,
      xp: 0,
      to: '/academia',
    })
  } else {
    const scheduled = routinesForDay(input.routines, weekday)
    const free = scheduled.length === 0
    const routine = scheduled[0] ?? oldestRoutine(input.routines, input.sessions)
    missions.push({
      id: 'treino',
      icon: '🏋️',
      title: routine ? routine.name : 'Treinar',
      detail: trainedToday
        ? 'Treino feito. Corrente alimentada.'
        : free
          ? 'Dia livre na agenda: treinar hoje é bônus.'
          : 'Treino marcado para hoje.',
      done: trainedToday,
      xp: XP_RULES.treino,
      optional: free,
      routine: routine ?? undefined,
      to: '/academia',
    })
  }

  const naos = stageToday(input.rejections, 'nao', now)
  missions.push({
    id: 'naos',
    icon: '🦁',
    title: `Tomar ${DAILY_NAOS} nãos`,
    detail:
      naos >= DAILY_NAOS
        ? 'Missão cumprida. Cada não a mais é bônus.'
        : 'Peça algo a alguém. O não é o placar, não o sim.',
    done: naos >= DAILY_NAOS,
    xp: DAILY_NAOS * FUNNEL_XP.nao,
    progress: { value: Math.min(naos, DAILY_NAOS), target: DAILY_NAOS },
    to: '/coragem',
  })

  const stepId = currentStepId(CARISMA, input.trackSteps)
  const step = flatSteps(CARISMA).find(({ step }) => step.id === stepId)?.step
  if (step) {
    missions.push({
      id: 'trilha',
      icon: '🗺️',
      title: step.name,
      detail: step.what,
      done: didToday(input.trackSteps, CARISMA.id, now),
      xp: XP_RULES.trilha,
      to: '/coragem/mapa',
    })
  }

  return missions
}

/** Sem treino marcado: sugere o que esta parado ha mais tempo. */
function oldestRoutine(
  routines: Routine[],
  sessions: Array<Pick<Session, 'started_at' | 'finished_at' | 'routine_id'>>,
): Routine | null {
  const active = routines.filter((r) => !r.archived)
  if (active.length === 0) return null
  const last = new Map<string, string>()
  for (const s of sessions) {
    if (!s.finished_at || !s.routine_id) continue
    const current = last.get(s.routine_id)
    if (!current || current < s.started_at) last.set(s.routine_id, s.started_at)
  }
  return [...active].sort((a, b) => {
    const la = last.get(a.id) ?? ''
    const lb = last.get(b.id) ?? ''
    return la === lb ? a.position - b.position : la.localeCompare(lb)
  })[0]
}

/* ------------------------------------------------------------ dia perfeito */

/** Bonus por dia perfeito: o bau do fim do dia. */
export const PERFECT_DAY_XP = 50

export interface PerfectDays {
  /** Todos os dias perfeitos do historico — base do bonus de XP. */
  total: number
  /** Dias perfeitos seguidos ate hoje (hoje so conta se ja fechou). */
  streak: number
  today: boolean
}

/**
 * Dia perfeito = treinou (ou era descanso declarado) e tomou os nãos do dia.
 * A trilha fica de fora: ela nao guarda data por execucao, entao nao da para
 * reconstruir o passado com ela.
 */
export function perfectDays(
  input: Pick<MissionInput, 'sessions' | 'settings' | 'rejections'>,
  now = new Date(),
): PerfectDays {
  const trained = new Set<string>()
  for (const s of input.sessions) {
    if (s.finished_at) trained.add(format(parseISO(s.started_at), 'yyyy-MM-dd'))
  }
  const naos = new Map<string, number>()
  for (const item of input.rejections) {
    if ((item.kind ?? 'nao') !== 'nao') continue
    const key = format(parseISO(item.happened_at), 'yyyy-MM-dd')
    naos.set(key, (naos.get(key) ?? 0) + 1)
  }

  const rest = new Set(input.settings.rest_days)
  const isPerfect = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd')
    const trainedOk = trained.has(key) || rest.has(day.getDay() as Weekday)
    return trainedOk && (naos.get(key) ?? 0) >= DAILY_NAOS
  }

  // So dias com nãos podem ser perfeitos: varre eles, nao o calendario todo.
  let total = 0
  for (const key of naos.keys()) if (isPerfect(parseISO(key))) total++

  const today = isPerfect(now)
  let streak = 0
  const day = new Date(now)
  if (!today) day.setDate(day.getDate() - 1)
  while (isPerfect(day)) {
    streak++
    day.setDate(day.getDate() - 1)
  }
  return { total, streak, today }
}

/* ------------------------------------------------------- chefao da semana */

const BOSSES = [
  { name: 'Dragão da Preguiça', icon: '🐉' },
  { name: 'Golem do Medo', icon: '🗿' },
  { name: 'Hidra da Vergonha', icon: '🐍' },
  { name: 'Kraken da Desculpa', icon: '🐙' },
  { name: 'Ogro do Sofá', icon: '👹' },
  { name: 'Fantasma do "E se..."', icon: '👻' },
]

export interface WeeklyBoss {
  name: string
  icon: string
  hp: number
  damage: number
  /** Vida restante, 0 a 1. */
  life: number
  defeated: boolean
  /** Golpes da semana, para o placar embaixo da barra. */
  hits: { treinos: number; naos: number; outros: number }
}

/**
 * Um chefao por semana, com vida do tamanho da sua agenda: cada treino
 * marcado vale 100 de vida, mais 10 nãos. Treino e funil tiram vida dele com
 * o mesmo peso do XP. Derrotar o chefao e cumprir a semana inteira.
 */
export function weeklyBoss(input: MissionInput, now = new Date()): WeeklyBoss {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))

  const rest = new Set(input.settings.rest_days)
  const due = new Set<number>()
  for (const r of input.routines) {
    if (r.archived) continue
    for (const d of r.scheduled_days ?? []) if (!rest.has(d)) due.add(d)
  }
  const treinosAlvo = due.size > 0 ? due.size : 3
  const hp = treinosAlvo * XP_RULES.treino + 10 * FUNNEL_XP.nao

  const inWeek = (iso: string) => parseISO(iso) >= start
  const treinos = input.sessions.filter((s) => s.finished_at && inWeek(s.started_at)).length
  let naos = 0
  let outros = 0
  let damage = treinos * XP_RULES.treino
  for (const item of input.rejections) {
    if (!inWeek(item.happened_at)) continue
    const kind = item.kind ?? 'nao'
    damage += FUNNEL_XP[kind]
    if (kind === 'nao') naos++
    else outros++
  }

  // Semana do ano escolhe o chefao: muda toda segunda, igual para todo mundo.
  const week = Math.floor((start.getTime() - new Date(start.getFullYear(), 0, 1).getTime()) / 6048e5)
  const boss = BOSSES[week % BOSSES.length]
  const life = Math.max(0, 1 - damage / hp)
  return { ...boss, hp, damage: Math.min(damage, hp), life, defeated: life === 0, hits: { treinos, naos, outros } }
}
