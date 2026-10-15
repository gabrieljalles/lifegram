import { differenceInCalendarDays, parseISO, startOfWeek } from 'date-fns'
import type { CourageRejection, FunnelContext, FunnelStage } from './types'

/**
 * Colecao de naos.
 *
 * A ideia e inverter o sinal do fora: quem so conta "sim" fica refem de uma
 * resposta que nao controla, e por isso evita pedir. Contando o "nao", a
 * unica coisa que move o numero e a acao — e a acao e a unica parte que
 * depende de voce. E o mesmo principio da escada do medo: exposicao repetida
 * ate o "nao" perder o peso que o medo inventou.
 */

/* ---------------------------------------------------------------- funil */

export interface FunnelStageMeta {
  id: FunnelStage
  label: string
  single: string
  /** Texto do botao de registro. */
  action: string
  icon: string
}

/**
 * O funil, da boca para o fundo. Cada etapa e mais estreita que a anterior —
 * e o formato que lembra que muito "nao" la em cima e o que alimenta o resto.
 */
export const FUNNEL_STAGES: FunnelStageMeta[] = [
  { id: 'nao', label: 'Nãos', single: 'Não', action: 'Tomei um não', icon: '🏆' },
  { id: 'sim', label: 'Sims', single: 'Sim', action: 'Ganhei um sim', icon: '✅' },
  { id: 'encontro', label: 'Encontros', single: 'Encontro', action: 'Marquei um encontro', icon: '☕' },
  { id: 'sexo', label: 'Sexo', single: 'Sexo', action: 'Rolou sexo', icon: '🔥' },
]

/** Registros antigos nao tem `kind`: todos eram "nao". */
export const stageOf = (item: Pick<CourageRejection, 'kind'>): FunnelStage => item.kind ?? 'nao'

/** So os "nao" — base das faixas, da sequencia e da trilha. */
export const onlyNaos = (list: CourageRejection[]): CourageRejection[] =>
  list.filter((item) => stageOf(item) === 'nao')

export function funnelCounts(list: CourageRejection[]): Record<FunnelStage, number> {
  const counts: Record<FunnelStage, number> = { nao: 0, sim: 0, encontro: 0, sexo: 0 }
  for (const item of list) counts[stageOf(item)]++
  return counts
}

/* ------------------------------------------------------------ contexto */

export const FUNNEL_CONTEXTS: Array<{ id: FunnelContext; label: string; icon: string }> = [
  { id: 'rua', label: 'Rua', icon: '🚶' },
  { id: 'festa', label: 'Festa', icon: '🎉' },
  { id: 'app', label: 'App', icon: '📱' },
  { id: 'academia', label: 'Academia', icon: '🏋️' },
  { id: 'trabalho', label: 'Trabalho', icon: '💼' },
  { id: 'faculdade', label: 'Faculdade', icon: '🎓' },
  { id: 'outro', label: 'Outro', icon: '📍' },
]

export interface ContextRow {
  id: FunnelContext
  label: string
  icon: string
  counts: Record<FunnelStage, number>
  /** Abordagens que tiveram resposta: nao + sim. */
  asks: number
  /** Fracao de sim entre as abordagens (0 a 1). null = nenhuma abordagem. */
  yesRate: number | null
}

/**
 * Funil quebrado por lugar, do que mais converte para o que menos. So entra
 * contexto com registro — lugar sem dado nao vira linha de zero.
 */
export function contextBreakdown(list: CourageRejection[]): ContextRow[] {
  const rows: ContextRow[] = []
  for (const meta of FUNNEL_CONTEXTS) {
    const items = list.filter((item) => item.context === meta.id)
    if (items.length === 0) continue
    const counts = funnelCounts(items)
    const asks = counts.nao + counts.sim
    rows.push({ ...meta, counts, asks, yesRate: asks > 0 ? counts.sim / asks : null })
  }
  return rows.sort((a, b) => (b.yesRate ?? -1) - (a.yesRate ?? -1) || b.asks - a.asks)
}

/** Quantos registros de uma etapa caíram hoje. */
export function stageToday(list: CourageRejection[], stage: FunnelStage, now = new Date()): number {
  const today = now.toDateString()
  return list.filter(
    (item) => stageOf(item) === stage && new Date(item.happened_at).toDateString() === today,
  ).length
}

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
