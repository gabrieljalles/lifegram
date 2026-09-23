import { differenceInCalendarDays, parseISO, startOfWeek } from 'date-fns'
import type { CourageRejection } from './types'

/**
 * Colecao de naos.
 *
 * A ideia e inverter o sinal do fora: quem so conta "sim" fica refem de uma
 * resposta que nao controla, e por isso evita pedir. Contando o "nao", a
 * unica coisa que move o numero e a acao — e a acao e a unica parte que
 * depende de voce. E o mesmo principio da escada do medo: exposicao repetida
 * ate o "nao" perder o peso que o medo inventou.
 */

export interface RejectionBadge {
  /** Quantos naos essa faixa exige. */
  at: number
  name: string
  icon: string
}

/** Faixas: a proxima sempre perto o bastante para valer a pena buscar. */
export const REJECTION_BADGES: RejectionBadge[] = [
  { at: 1, name: 'Quebrou o gelo', icon: '🧊' },
  { at: 5, name: 'Pegando gosto', icon: '🔥' },
  { at: 10, name: 'Casca grossa', icon: '🛡️' },
  { at: 25, name: 'Faixa preta do não', icon: '🥋' },
  { at: 50, name: 'Colecionador', icon: '🏴' },
  { at: 100, name: 'Centurião', icon: '👑' },
  { at: 250, name: 'Lenda', icon: '🐉' },
]

/** A maior faixa ja conquistada. null = ainda nenhuma. */
export function badgeFor(total: number): RejectionBadge | null {
  let conquistada: RejectionBadge | null = null
  for (const badge of REJECTION_BADGES) {
    if (total >= badge.at) conquistada = badge
  }
  return conquistada
}

/** A proxima faixa a buscar. null = todas conquistadas. */
export function nextBadge(total: number): RejectionBadge | null {
  return REJECTION_BADGES.find((badge) => total < badge.at) ?? null
}

export interface RejectionProgress {
  total: number
  badge: RejectionBadge | null
  next: RejectionBadge | null
  /** Quantos faltam para a proxima faixa. 0 = nao ha proxima. */
  missing: number
  /** 0 a 1 dentro do trecho entre a faixa atual e a proxima. */
  ratio: number
}

export function rejectionProgress(total: number): RejectionProgress {
  const badge = badgeFor(total)
  const next = nextBadge(total)
  if (!next) {
    return { total, badge, next: null, missing: 0, ratio: 1 }
  }
  const from = badge?.at ?? 0
  const span = next.at - from
  return {
    total,
    badge,
    next,
    missing: next.at - total,
    ratio: span > 0 ? Math.min(1, Math.max(0, (total - from) / span)) : 0,
  }
}

/** Quantos nesta semana (segunda a domingo). */
export function rejectionsThisWeek(list: CourageRejection[], today = new Date()): number {
  const inicio = startOfWeek(today, { weekStartsOn: 1 })
  return list.filter((item) => parseISO(item.happened_at) >= inicio).length
}

/** Dias seguidos (ate hoje) com pelo menos um nao — tolerancia de 1 dia. */
export function rejectionStreak(list: CourageRejection[], today = new Date()): number {
  const dias = [
    ...new Set(list.map((item) => differenceInCalendarDays(today, parseISO(item.happened_at)))),
  ].sort((a, b) => a - b)
  if (dias.length === 0 || dias[0] > 1) return 0

  let streak = 1
  for (let i = 1; i < dias.length; i++) {
    if (dias[i] - dias[i - 1] <= 1) streak++
    else break
  }
  return streak
}

/**
 * Frases do momento do registro. Variam de proposito: recompensa que sempre
 * chega igual para de ser recompensa.
 */
export const PRAISES = [
  'Você pediu. É essa parte que depende de você.',
  'Doeu menos do que o medo prometia, né?',
  'Mais um não na coleção. O sim não vem sem eles.',
  'Quem não pede, já levou o não — só que sem tentar.',
  'Isso aqui é treino. Você acabou de fazer a série.',
  'O não já era seu antes de perguntar. Agora é só um número.',
  'Coragem não é não sentir medo. É isto.',
  'Constância vence carisma. Continue.',
  'Você virou alguém que pede. Isso muda tudo.',
  'Fora recebido, ego intacto, conta subindo.',
]

/** `roll` entre 0 e 1 (normalmente Math.random no clique, nunca no render). */
export function praiseFor(roll: number): string {
  const index = Math.min(PRAISES.length - 1, Math.max(0, Math.floor(roll * PRAISES.length)))
  return PRAISES[index]
}
