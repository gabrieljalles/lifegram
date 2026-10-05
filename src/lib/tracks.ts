import { CARISMA } from './trackCarisma'
import { nowISO, type CourageTrackStep, type ID } from './types'

export { CARISMA }

/**
 * Trilhas da Coragem: caminhos prontos, em ordem crescente de desconforto.
 *
 * Diferente dos objetivos que voce cria, aqui o conteudo e fixo e vive em
 * codigo — so o progresso vai para o banco. A ideia e resolver o "nao sei por
 * onde comecar": em vez de inventar um degrau, voce so abre o mapa e faz o que
 * esta aceso.
 */

export interface TrackStep {
  id: string
  name: string
  /** O que fazer, em uma frase imperativa. */
  what: string
  /** Por que este degrau existe. Sem ele, a folha mostra a nota do capitulo. */
  why?: string
  /** Execucoes para fechar o degrau (1 a 3). */
  needs: number
  /** Degrau em que levar um nao e possivel: oferece contar no contador. */
  rejectionLinked?: boolean
  /** Pico de exposicao, marcado no mapa com uma chama. */
  bold?: boolean
  /** Nivel de autoestima: a relacao com voce mesmo, marcada com 💜. */
  esteem?: boolean
  /**
   * Nivel que o teste de nivelamento nunca fecha: e o ponto fraco declarado,
   * que precisa ser treinado mesmo quando o resto do capitulo ja e facil.
   */
  keep?: boolean
}

export interface TrackChapter {
  id: string
  name: string
  icon: string
  /** Aviso fixo no topo do capitulo, quando ele precisa de uma regra. */
  note?: string
  steps: TrackStep[]
}

export interface Track {
  id: string
  name: string
  icon: string
  blurb: string
  chapters: TrackChapter[]
}

export const TRACKS: Track[] = [CARISMA]

export const trackById = (id: string): Track | undefined => TRACKS.find((t) => t.id === id)

/** Todos os degraus na ordem do caminho, com o capitulo de cada um junto. */
export function flatSteps(track: Track): Array<{ step: TrackStep; chapter: TrackChapter }> {
  return track.chapters.flatMap((chapter) => chapter.steps.map((step) => ({ step, chapter })))
}

/* ------------------------------------------------------------ progresso */

export type StepStatus = 'feito' | 'pulado' | 'atual' | 'bloqueado'

/** Indexa o progresso por step_id — as telas consultam direto. */
export function progressByStep(
  rows: CourageTrackStep[],
  track_id: string,
): Map<string, CourageTrackStep> {
  const map = new Map<string, CourageTrackStep>()
  for (const row of rows) {
    if (row.track_id !== track_id) continue
    map.set(row.step_id, row)
  }
  return map
}

const isClosed = (row: CourageTrackStep | undefined): boolean =>
  Boolean(row && (row.completed_at !== null || row.skipped_at !== null))

/**
 * O degrau da vez: o primeiro que ainda nao foi fechado.
 *
 * Linear de proposito — a graca do mapa e nao ter que escolher. Pular e a
 * valvula de escape para quem ja faz aquilo sem esforco.
 */
export function currentStepId(track: Track, rows: CourageTrackStep[]): string | null {
  const progress = progressByStep(rows, track.id)
  for (const { step } of flatSteps(track)) {
    if (!isClosed(progress.get(step.id))) return step.id
  }
  return null
}

export function stepStatus(
  step: TrackStep,
  row: CourageTrackStep | undefined,
  currentId: string | null,
): StepStatus {
  if (row?.completed_at) return 'feito'
  if (row?.skipped_at) return 'pulado'
  return step.id === currentId ? 'atual' : 'bloqueado'
}

export interface TrackProgress {
  total: number
  /** Degraus fechados: concluidos mais pulados. */
  closed: number
  completed: number
  skipped: number
  percent: number
  currentId: string | null
  /** Capitulo do degrau da vez. null quando a trilha acabou. */
  currentChapter: TrackChapter | null
}

export function trackProgress(track: Track, rows: CourageTrackStep[]): TrackProgress {
  const progress = progressByStep(rows, track.id)
  const steps = flatSteps(track)
  const completed = steps.filter(({ step }) => progress.get(step.id)?.completed_at).length
  const skipped = steps.filter(
    ({ step }) => !progress.get(step.id)?.completed_at && progress.get(step.id)?.skipped_at,
  ).length
  const closed = completed + skipped
  const currentId = currentStepId(track, rows)

  return {
    total: steps.length,
    closed,
    completed,
    skipped,
    percent: steps.length === 0 ? 0 : Math.round((closed / steps.length) * 100),
    currentId,
    currentChapter: steps.find(({ step }) => step.id === currentId)?.chapter ?? null,
  }
}

/* -------------------------------------------------------------- escrita */

/** Linha zerada, criada no primeiro toque num degrau. */
export function emptyRow(
  id: ID,
  user_id: string | null,
  track_id: string,
  step_id: string,
): CourageTrackStep {
  const now = nowISO()
  return {
    id,
    user_id,
    track_id,
    step_id,
    attempts: 0,
    done: 0,
    easy: 0,
    hard: 0,
    completed_at: null,
    skipped_at: null,
    updated_at: now,
  }
}

/** Como foi a execucao, em um toque. */
export type Rating = 'facil' | 'normal' | 'dificil'

/** Execucoes ja creditadas: facil vale por duas. */
export const creditOf = (row: CourageTrackStep | undefined): number =>
  (row?.done ?? 0) + (row?.easy ?? 0)

/**
 * Execucoes que o nivel pede de fato. A primeira marcada como dificil
 * acrescenta uma — uma so, e nunca passando de 3, para o nivel nao virar um
 * muro.
 */
export function neededFor(base: number, row: CourageTrackStep | undefined): number {
  const extra = (row?.hard ?? 0) > 0 ? 1 : 0
  return Math.max(base, Math.min(3, base + extra))
}

/**
 * Registra uma execucao do nivel. Toda execucao conta: nao existe tentativa
 * perdida. A avaliacao so muda quanto falta.
 *
 * `base` e o que o nivel pede no contexto atual (ritmo do capitulo e embalo,
 * de `baseNeeds`). Nada reabre um nivel ja fechado — progresso nao anda para
 * tras.
 */
export function registerAttempt(
  row: CourageTrackStep,
  rating: Rating,
  base: number,
): CourageTrackStep {
  if (row.completed_at) return row

  const now = nowISO()
  const next: CourageTrackStep = {
    ...row,
    attempts: row.attempts + 1,
    done: row.done + 1,
    easy: (row.easy ?? 0) + (rating === 'facil' ? 1 : 0),
    hard: (row.hard ?? 0) + (rating === 'dificil' ? 1 : 0),
    updated_at: now,
  }
  const closes = creditOf(next) >= neededFor(base, next)
  return {
    ...next,
    completed_at: closes ? now : null,
    // Fazer depois de ter pulado limpa a marca de pulado: virou feito.
    skipped_at: closes ? null : row.skipped_at,
  }
}

/* ------------------------------------------------------------- adaptacao */

/**
 * Ritmo de um capitulo, vindo da calibracao:
 * - completo: cada nivel pede o que esta escrito;
 * - rapido: metade, arredondada para cima (3 vira 2, 2 vira 1);
 * - nivelamento: rapido, e antes de comecar o capitulo o mapa oferece o
 *   desafio final dele como teste.
 */
export type Pace = 'completo' | 'rapido' | 'nivelamento'

/** O nivel foi facil para voce: maioria das execucoes faceis e nenhuma dificil. */
export function wasEasy(row: CourageTrackStep | undefined): boolean {
  if (!row || row.done === 0 || (row.hard ?? 0) > 0) return false
  return (row.easy ?? 0) * 2 >= row.done
}

function locate(track: Track, stepId: string) {
  for (const chapter of track.chapters) {
    const index = chapter.steps.findIndex((s) => s.id === stepId)
    if (index >= 0) return { chapter, index, step: chapter.steps[index] }
  }
  return null
}

/**
 * Quantas execucoes o nivel pede agora, antes das avaliacoes dele proprio.
 *
 * O embalo so vale dentro do capitulo: ser bom em elogiar coisas nao diz nada
 * sobre abordar alguem. Duas regras, as duas exigindo mais de uma avaliacao
 * para um dia bom nao decidir sozinho:
 * - os dois niveis anteriores do capitulo foram faceis: este pede 1;
 * - com 4 ou mais concluidos no capitulo, 2/3 deles faceis: o resto pede 1.
 */
export function baseNeeds(
  track: Track,
  rows: CourageTrackStep[],
  stepId: string,
  paces: Record<string, Pace>,
): number {
  const found = locate(track, stepId)
  if (!found) return 1
  const { chapter, index, step } = found
  const pace = paces[chapter.id] ?? 'completo'
  let needs = pace === 'completo' ? step.needs : Math.ceil(step.needs / 2)

  const progress = progressByStep(rows, track.id)
  const anteriores = chapter.steps
    .slice(0, index)
    .map((s) => progress.get(s.id))
    .filter((r): r is CourageTrackStep => Boolean(r?.completed_at))
  const faceis = anteriores.map(wasEasy)

  const ultimos = faceis.slice(-2)
  if (ultimos.length === 2 && ultimos.every(Boolean)) needs = 1
  if (anteriores.length >= 4 && faceis.filter(Boolean).length * 3 >= anteriores.length * 2) {
    needs = 1
  }
  return needs
}

/** Dificil duas vezes no mesmo nivel: hora de sugerir um aquecimento. */
export const needsWarmup = (row: CourageTrackStep | undefined): boolean => (row?.hard ?? 0) >= 2

/**
 * O teste de nivelamento disponivel agora, se houver: o capitulo da vez esta
 * marcado para nivelamento, ainda nao tem nivel fechado e o desafio final dele
 * ainda nao foi tentado. Um teste por capitulo — feito, a oferta some.
 */
export function levelingOffer(
  track: Track,
  rows: CourageTrackStep[],
  paces: Record<string, Pace>,
): { chapter: TrackChapter; step: TrackStep; index: number } | null {
  const current = currentStepId(track, rows)
  if (!current) return null
  const found = locate(track, current)
  if (!found || paces[found.chapter.id] !== 'nivelamento') return null

  const { chapter } = found
  const progress = progressByStep(rows, track.id)
  if (chapter.steps.some((s) => isClosed(progress.get(s.id)))) return null

  const final = chapter.steps[chapter.steps.length - 1]
  if ((progress.get(final.id)?.attempts ?? 0) > 0) return null

  const index = flatSteps(track).findIndex(({ step }) => step.id === final.id)
  return { chapter, step: final, index }
}

/**
 * Passou no teste (desafio final marcado como facil): os niveis do capitulo
 * que ainda estao abertos fecham como dominados — menos os marcados `keep`,
 * que sao o ponto fraco e continuam no caminho.
 */
export function levelingSkips(
  chapter: TrackChapter,
  rows: CourageTrackStep[],
  track_id: string,
): string[] {
  const progress = progressByStep(rows, track_id)
  const final = chapter.steps[chapter.steps.length - 1]
  return chapter.steps
    .filter((s) => s.id !== final.id && !s.keep && !isClosed(progress.get(s.id)))
    .map((s) => s.id)
}

/**
 * Houve execucao registrada hoje? A meta da trilha e pelo menos uma por dia.
 * Pular nao conta: so execucao de verdade move o `done`.
 */
export function didToday(rows: CourageTrackStep[], track_id: string, now = new Date()): boolean {
  const today = now.toDateString()
  return rows.some(
    (r) => r.track_id === track_id && r.done > 0 && new Date(r.updated_at).toDateString() === today,
  )
}

/** "Isso ja e normal para mim": fecha o degrau sem fingir que foi treinado. */
export function skipStep(row: CourageTrackStep): CourageTrackStep {
  if (row.completed_at) return row
  const now = nowISO()
  return { ...row, skipped_at: now, updated_at: now }
}
