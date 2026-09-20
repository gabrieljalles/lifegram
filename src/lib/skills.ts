/**
 * Registro das areas da vida que o app acompanha.
 *
 * O app nasceu so com academia, mas a ideia e cobrir varias skills (coragem,
 * estudo, o que vier). Centralizar a lista aqui faz o hub e a tela de
 * desempenho crescerem sozinhos: area nova e uma entrada nesta lista, nao uma
 * tela nova em cada lugar.
 */
export type SkillId = 'exercicios' | 'coragem'

export interface SkillArea {
  id: SkillId
  name: string
  icon: string
  /** Frase curta no cartao do hub. */
  blurb: string
  /** Rota da area. null = area ainda sem tela, exibida como "em breve". */
  to: string | null
  accent: 'brand' | 'aqua' | 'flame'
}

export const SKILL_AREAS: SkillArea[] = [
  {
    id: 'exercicios',
    name: 'Exercícios',
    icon: '🏋️',
    blurb: 'Treinos, cargas, recordes e a corrente da semana',
    to: '/academia',
    accent: 'brand',
  },
  {
    id: 'coragem',
    name: 'Coragem',
    icon: '🦁',
    blurb: 'Escada do medo: encarar, medir e ver a nota cair até 0',
    to: '/coragem',
    accent: 'flame',
  },
]

/** Uma metrica pronta para a tela: valor ja formatado, sem conta na view. */
export interface SkillStat {
  label: string
  value: string
  hint?: string
}

/**
 * Retrato de uma skill para a tela de desempenho. `active: false` significa
 * "ainda nao ha o que medir" — e a tela diz isso, em vez de inventar zero.
 */
export interface SkillSnapshot {
  area: SkillArea
  active: boolean
  headline: string
  stats: SkillStat[]
  /** Variacao percentual contra o periodo anterior; null = sem base de comparacao. */
  trend: number | null
  trendLabel: string
}

export const ACCENT_TEXT: Record<SkillArea['accent'], string> = {
  brand: 'text-brand-400',
  aqua: 'text-aqua-400',
  flame: 'text-fire-400',
}

export const ACCENT_RING: Record<SkillArea['accent'], string> = {
  brand: 'border-brand-500/40 bg-brand-600/10',
  aqua: 'border-aqua-500/40 bg-aqua-600/10',
  flame: 'border-fire-500/40 bg-fire-600/10',
}
