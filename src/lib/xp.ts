import { completedOf } from './courage'
import { stageOf } from './rejections'
import type {
  CourageAttempt,
  CourageRejection,
  CourageTrackStep,
  FunnelStage,
  Session,
  SetLog,
} from './types'

/**
 * XP e niveis.
 *
 * Nada aqui e guardado: o XP e recalculado a partir do que voce ja registra
 * (treinos, recordes, funil, trilha). Assim ele nunca diverge dos dados, sobe
 * sozinho com o historico antigo e nao precisa de tabela nova nem de sync.
 */

export const XP_RULES = {
  treino: 100,
  recorde: 25,
  trilha: 30,
  tentativa: 30,
} as const

/** Etapas mais fundas do funil valem mais: sao mais raras e mais caras. */
export const FUNNEL_XP: Record<FunnelStage, number> = {
  nao: 20,
  sim: 40,
  encontro: 80,
  sexo: 150,
}

/** XP acumulado para chegar ao nivel `level`: 0, 100, 300, 600, 1000... */
export const xpToReach = (level: number): number => 50 * level * (level - 1)

export function levelOf(xp: number): number {
  let level = 1
  while (xp >= xpToReach(level + 1)) level++
  return level
}

const TITLES: Array<{ from: number; title: string }> = [
  { from: 1, title: 'Novato' },
  { from: 3, title: 'Aprendiz' },
  { from: 5, title: 'Determinado' },
  { from: 8, title: 'Guerreiro' },
  { from: 12, title: 'Veterano' },
  { from: 17, title: 'Mestre' },
  { from: 25, title: 'Lenda' },
]

export function titleOf(level: number): string {
  let title = TITLES[0].title
  for (const entry of TITLES) if (level >= entry.from) title = entry.title
  return title
}

export interface XPSources {
  sessions: Array<Pick<Session, 'started_at' | 'finished_at'>>
  setLogs: Array<Pick<SetLog, 'completed_at' | 'is_pr_weight' | 'is_pr_volume'>>
  rejections: Array<Pick<CourageRejection, 'kind' | 'happened_at'>>
  trackSteps: Array<Pick<CourageTrackStep, 'done'>>
  attempts: CourageAttempt[]
  /** XP extra que nao vem de registro: bonus de dia perfeito. */
  bonus?: number
}

export interface XPBreakdown {
  treino: number
  coragem: number
}

export interface XPState {
  total: number
  /** Ganho hoje — o numero que da vontade de fazer mais uma coisa. */
  today: number
  level: number
  title: string
  /** XP dentro do nivel atual e tamanho do nivel: a barra. */
  into: number
  span: number
  ratio: number
  breakdown: XPBreakdown
}

export function computeXP(src: XPSources, now = new Date()): XPState {
  const todayKey = now.toDateString()
  const isToday = (iso: string) => new Date(iso).toDateString() === todayKey

  let treino = 0
  let coragem = 0
  let today = 0

  for (const session of src.sessions) {
    if (!session.finished_at) continue
    treino += XP_RULES.treino
    if (isToday(session.started_at)) today += XP_RULES.treino
  }
  for (const log of src.setLogs) {
    if (!log.is_pr_weight && !log.is_pr_volume) continue
    treino += XP_RULES.recorde
    if (isToday(log.completed_at)) today += XP_RULES.recorde
  }
  for (const item of src.rejections) {
    const xp = FUNNEL_XP[stageOf(item)]
    coragem += xp
    if (isToday(item.happened_at)) today += xp
  }
  // A trilha nao guarda data por execucao, so o total: entra no acumulado,
  // nao no "hoje".
  for (const row of src.trackSteps) coragem += row.done * XP_RULES.trilha
  for (const attempt of completedOf(src.attempts)) {
    coragem += XP_RULES.tentativa
    if (attempt.completed_at && isToday(attempt.completed_at)) today += XP_RULES.tentativa
  }

  const total = treino + coragem + (src.bonus ?? 0)
  const level = levelOf(total)
  const from = xpToReach(level)
  const span = xpToReach(level + 1) - from
  return {
    total,
    today,
    level,
    title: titleOf(level),
    into: total - from,
    span,
    ratio: span > 0 ? (total - from) / span : 0,
    breakdown: { treino, coragem },
  }
}
