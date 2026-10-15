/**
 * Gerador do chefao da semana.
 *
 * Cada semana do ano vira uma semente, e a semente sorteia as pecas do
 * boneco: corpo, cor, olhos, chifres, boca, bracos, pernas e acessorio. Mesma
 * semana = mesmo chefao em qualquer aparelho, sem guardar nada no banco.
 * Com as combinacoes abaixo sao dezenas de milhares de chefoes possiveis.
 */

export type BossBody = 'bolha' | 'torre' | 'bloco' | 'pera'
export type BossHorns = 'nenhum' | 'par' | 'unicornio' | 'galhada'
export type BossMouth = 'presas' | 'sorriso' | 'boca-aberta' | 'dentuca'
export type BossArms = 'nenhum' | 'cotocos' | 'tentaculos' | 'garras'
export type BossLegs = 'flutua' | 'cotocos' | 'aranha'
export type BossExtra = 'nenhum' | 'coroa' | 'asas' | 'espinhos' | 'aureola'

export interface BossTraits {
  body: BossBody
  /** Cor do corpo e cor de detalhe, em hex. */
  color: string
  accent: string
  eyes: 1 | 2 | 3
  eyeSize: number
  horns: BossHorns
  mouth: BossMouth
  arms: BossArms
  legs: BossLegs
  extra: BossExtra
  /** Achatado (<1) ou esticado (>1). */
  stretch: number
}

export interface BossDesign {
  seed: number
  name: string
  traits: BossTraits
  /** Frases quando voce cutuca o chefao. */
  taunts: string[]
}

/* -------------------------------------------------------------- sorteio */

/** PRNG pequeno e deterministico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(random: () => number, list: readonly T[]): T =>
  list[Math.floor(random() * list.length) % list.length]

/** Semente da semana: ano e semana (segunda a domingo). */
export function weekSeed(date: Date): number {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const jan1 = new Date(start.getFullYear(), 0, 1)
  const week = Math.floor((start.getTime() - jan1.getTime()) / 6048e5)
  return start.getFullYear() * 100 + week
}

/* ---------------------------------------------------------------- pecas */

const PALETTES: Array<{ color: string; accent: string }> = [
  { color: '#7c3aed', accent: '#fbbf24' }, // roxo e ouro
  { color: '#16a34a', accent: '#f97316' }, // verde e laranja
  { color: '#dc2626', accent: '#1f2937' }, // vermelho e grafite
  { color: '#0891b2', accent: '#f472b6' }, // ciano e rosa
  { color: '#ea580c', accent: '#7c2d12' }, // laranja e marrom
  { color: '#4f46e5', accent: '#a3e635' }, // anil e lima
  { color: '#be185d', accent: '#fde68a' }, // magenta e creme
  { color: '#65a30d', accent: '#581c87' }, // musgo e uva
  { color: '#475569', accent: '#ef4444' }, // pedra e brasa
  { color: '#0d9488', accent: '#fcd34d' }, // jade e mel
]

/** Bicho do nome: sai das pecas, para o nome combinar com o que se ve. */
function creatureOf(t: BossTraits, random: () => number): string {
  if (t.eyes === 1) return 'Ciclope'
  if (t.eyes === 3) return pick(random, ['Hidra', 'Abominação'])
  if (t.arms === 'tentaculos') return 'Kraken'
  if (t.extra === 'asas') return pick(random, ['Dragão', 'Gárgula'])
  if (t.body === 'bloco') return 'Golem'
  if (t.horns !== 'nenhum') return pick(random, ['Demônio', 'Minotauro'])
  if (t.legs === 'aranha') return 'Aracnídeo'
  if (t.body === 'bolha') return pick(random, ['Gosma', 'Blob'])
  return pick(random, ['Ogro', 'Troll', 'Goblin'])
}

/** O vicio que o chefao representa — e o que voce derrota na semana. */
const VICES: Array<{ name: string; taunts: string[] }> = [
  {
    name: 'da Preguiça',
    taunts: ['Deita mais 5 minutinhos…', 'Treino? Amanhã você faz.', 'O sofá tá tão quentinho.'],
  },
  {
    name: 'do Medo',
    taunts: ['E se ela rir de você?', 'Melhor não arriscar.', 'Você vai travar de novo.'],
  },
  {
    name: 'da Vergonha',
    taunts: ['Todo mundo tá olhando…', 'Que mico seria.', 'Fica quietinho aí.'],
  },
  {
    name: 'da Desculpa',
    taunts: ['Hoje tá chovendo.', 'Tô cansado demais.', 'Semana que vem eu começo.'],
  },
  {
    name: 'do Celular',
    taunts: ['Só mais um vídeo…', 'Rola o feed, rola.', 'Notificação nova!'],
  },
  {
    name: 'do "E se…"',
    taunts: ['E se der errado?', 'E se não for a hora?', 'E se…'],
  },
  {
    name: 'da Procrastinação',
    taunts: ['Depois você vê isso.', 'Ainda dá tempo.', 'Deixa pra última hora.'],
  },
]

export function generateBoss(seed: number): BossDesign {
  const random = rng(seed)
  const palette = pick(random, PALETTES)
  const traits: BossTraits = {
    body: pick(random, ['bolha', 'torre', 'bloco', 'pera'] as const),
    color: palette.color,
    accent: palette.accent,
    eyes: pick(random, [1, 2, 2, 3] as const),
    eyeSize: 0.8 + random() * 0.5,
    horns: pick(random, ['nenhum', 'par', 'par', 'unicornio', 'galhada'] as const),
    mouth: pick(random, ['presas', 'sorriso', 'boca-aberta', 'dentuca'] as const),
    arms: pick(random, ['nenhum', 'cotocos', 'cotocos', 'tentaculos', 'garras'] as const),
    legs: pick(random, ['flutua', 'cotocos', 'cotocos', 'aranha'] as const),
    extra: pick(random, ['nenhum', 'coroa', 'asas', 'espinhos', 'aureola'] as const),
    stretch: 0.85 + random() * 0.35,
  }
  const vice = pick(random, VICES)
  return {
    seed,
    name: `${creatureOf(traits, random)} ${vice.name}`,
    traits,
    taunts: vice.taunts,
  }
}
