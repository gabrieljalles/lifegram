import { differenceInCalendarWeeks, format, parseISO, startOfWeek } from 'date-fns'
import {
  COURAGE_MAX_SCORE,
  COURAGE_MIN_ATTEMPTS,
  COURAGE_MIN_SCORE,
  COURAGE_REEVALUATE_GAP,
  type CourageAttempt,
  type CourageGoal,
  type CouragePeople,
  type CouragePeriod,
  type CouragePlace,
  type CourageScoreChange,
  type CourageStatus,
} from './types'

/**
 * Escada do medo: logica pura, sem React e sem banco.
 *
 * A regra que atravessa o arquivo inteiro e uma so — a nota de um objetivo
 * nunca cai sozinha. O app calcula, sugere e explica; quem confirma e a
 * pessoa. Baixar nota por vontade de ver progresso estraga o unico dado que
 * importa aqui: o tamanho do exagero do medo.
 */

/* -------------------------------------------------------------- basico */

export const clampScore = (value: number): number =>
  Math.min(COURAGE_MAX_SCORE, Math.max(COURAGE_MIN_SCORE, Math.round(value)))

/** Tentativa completa = tem nota real. So essas entram em qualquer media. */
export const isComplete = (
  attempt: CourageAttempt,
): attempt is CourageAttempt & { actual: number } => attempt.actual !== null

export const completedOf = (
  attempts: CourageAttempt[],
): Array<CourageAttempt & { actual: number }> =>
  attempts.filter(isComplete).sort((a, b) => a.planned_at.localeCompare(b.planned_at))

export const pendingOf = (attempts: CourageAttempt[]): CourageAttempt[] =>
  attempts.filter((a) => !isComplete(a)).sort((a, b) => a.planned_at.localeCompare(b.planned_at))

export const attemptsOfGoal = (attempts: CourageAttempt[], goal_id: string): CourageAttempt[] =>
  attempts
    .filter((a) => a.goal_id === goal_id)
    .sort((a, b) => a.planned_at.localeCompare(b.planned_at))

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length

const round1 = (value: number): number => Math.round(value * 10) / 10

/** Desvio padrao populacional: aqui as tentativas SAO a populacao inteira. */
const stdev = (values: number[]): number => {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

/**
 * Media movel das ultimas `window` notas. Os primeiros pontos ficam null de
 * proposito: media de um ponto so nao e media, e desenhar isso sugeriria uma
 * tendencia que ainda nao existe.
 */
export function movingAverage(values: number[], window = 3): Array<number | null> {
  return values.map((_, index) => {
    if (index + 1 < window) return null
    return round1(mean(values.slice(index + 1 - window, index + 1)))
  })
}

/* ------------------------------------------------- honestidade dos dados */

export type ConfidenceLevel = 'insuficiente' | 'sugestao' | 'tendencia'

export interface Confidence {
  level: ConfidenceLevel
  /** Frase pronta para abrir qualquer afirmacao sobre os numeros. */
  phrase: string
  note: string
}

/**
 * Quanto se pode afirmar com N tentativas completas. Menos de 3: nada. Ate 4:
 * "por enquanto os dados sugerem". De 5 em diante: da para falar em tendencia.
 */
export function confidenceOf(completed: number): Confidence {
  if (completed < COURAGE_MIN_ATTEMPTS) {
    return {
      level: 'insuficiente',
      phrase: 'Poucos dados ainda',
      note: `Com ${completed} de ${COURAGE_MIN_ATTEMPTS} tentativas não dá para concluir nada — e tudo bem, o primeiro trabalho é acumular repetição.`,
    }
  }
  if (completed < 5) {
    return {
      level: 'sugestao',
      phrase: 'Por enquanto os dados sugerem',
      note: 'Com 3 ou 4 tentativas já dá para desconfiar de um padrão, mas ainda não é tendência.',
    }
  }
  return {
    level: 'tendencia',
    phrase: 'Os dados mostram',
    note: `Com ${completed} tentativas completas já dá para falar em tendência.`,
  }
}

/* ------------------------------------------------------ stats por objetivo */

export interface GoalStats {
  total: number
  completed: number
  pending: number
  avgPredicted: number
  avgActual: number
  /** Erro medio de previsao: previsto - real. Positivo = o medo exagerou. */
  bias: number
  /** Proporcao de resultados ok entre as completas; null = sem dado. */
  okRate: number | null
  /** Desvio padrao das notas reais: quanto a experiencia oscila. */
  consistency: number
  lastActual: number | null
  confidence: Confidence
}

export function goalStats(attempts: CourageAttempt[]): GoalStats {
  const completed = completedOf(attempts)
  const predicted = completed.map((a) => a.predicted)
  const actual = completed.map((a) => a.actual)
  const decided = completed.filter((a) => a.outcome_ok !== null)

  return {
    total: attempts.length,
    completed: completed.length,
    pending: attempts.length - completed.length,
    avgPredicted: round1(mean(predicted)),
    avgActual: round1(mean(actual)),
    bias: round1(mean(predicted) - mean(actual)),
    okRate:
      decided.length === 0 ? null : decided.filter((a) => a.outcome_ok).length / decided.length,
    consistency: round1(stdev(actual)),
    lastActual: actual.length > 0 ? actual[actual.length - 1] : null,
    confidence: confidenceOf(completed.length),
  }
}

/* ------------------------------------------------------------ avaliacao */

export interface GoalEvaluation {
  status: CourageStatus
  /** Media real ficou >= 2 pontos abaixo da prevista, com 3+ tentativas. */
  readyToReevaluate: boolean
  /** Nota sugerida (media das reais, arredondada). Voce confirma ou ajusta. */
  suggestedScore: number | null
  /** Nota alta que nao cede depois de varias tentativas: quebrar em passos. */
  shouldSplit: boolean
  /** Explicacao curta do estado atual, com a linguagem de confianca correta. */
  message: string
}

/**
 * Le as tentativas de um objetivo e diz em que pe ele esta.
 *
 * "Normalizado" exige as duas coisas: nota 0 E as tres ultimas tentativas com
 * resultado ok. Nota 0 sem historico bom seria so otimismo.
 */
export function evaluateGoal(
  goal: Pick<CourageGoal, 'score'>,
  attempts: CourageAttempt[],
  hasChildren = false,
): GoalEvaluation {
  const completed = completedOf(attempts)
  const stats = goalStats(attempts)
  const lastThree = completed.slice(-3)
  const normalized =
    goal.score === COURAGE_MIN_SCORE &&
    lastThree.length >= 3 &&
    lastThree.every((a) => a.outcome_ok === true)

  const enough = completed.length >= COURAGE_MIN_ATTEMPTS
  const suggested = clampScore(stats.avgActual)
  // A sugestao so vale se houver o que baixar: quando a nota oficial ja bate
  // com a media real, o degrau esta calibrado e insistir viraria so ruido.
  const readyToReevaluate =
    enough &&
    goal.score > COURAGE_MIN_SCORE &&
    stats.bias >= COURAGE_REEVALUATE_GAP &&
    suggested < goal.score

  // Nota real alta e teimosa: mais repeticao nao vai resolver, o degrau e que
  // esta grande demais.
  const firstThree = completed.slice(0, 3)
  const stalled =
    completed.length >= 5 &&
    stats.avgActual >= 7 &&
    mean(lastThree.map((a) => a.actual)) > mean(firstThree.map((a) => a.actual)) - 1
  const shouldSplit = stalled && !hasChildren

  const status: CourageStatus = normalized
    ? 'normalizado'
    : readyToReevaluate
      ? 'reavaliar'
      : 'andamento'

  let message: string
  if (normalized) {
    message = 'Virou rotina: nota 0 e as três últimas tentativas com resultado ok.'
  } else if (!enough) {
    message = stats.confidence.note
  } else if (readyToReevaluate) {
    message = `${stats.confidence.phrase}: na prática foi ${stats.bias} ${
      stats.bias === 1 ? 'ponto' : 'pontos'
    } mais fácil do que você previu.`
  } else if (shouldSplit) {
    message = `${stats.confidence.phrase} que este degrau é grande demais — vale quebrar em passos menores.`
  } else if (enough && stats.bias >= COURAGE_REEVALUATE_GAP) {
    message = `Nota calibrada: a média real (${stats.avgActual}) já corresponde à nota ${goal.score}. A previsão é que ainda exagera.`
  } else {
    message = `${stats.confidence.phrase}: previsto ${stats.avgPredicted}, real ${stats.avgActual}. Ainda não é diferença suficiente para baixar a nota.`
  }

  return {
    status,
    readyToReevaluate,
    suggestedScore: readyToReevaluate ? suggested : null,
    shouldSplit,
    message,
  }
}

/* -------------------------------------------------------------- series */

export interface AttemptPoint {
  label: string
  prevista: number
  real: number | null
  media: number | null
}

/** Previsto x real tentativa a tentativa, com a media movel sobreposta. */
export function attemptSeries(attempts: CourageAttempt[], window = 3): AttemptPoint[] {
  const completed = completedOf(attempts)
  const averages = movingAverage(
    completed.map((a) => a.actual),
    window,
  )
  return completed.map((attempt, index) => ({
    label: String(index + 1),
    prevista: attempt.predicted,
    real: attempt.actual,
    media: averages[index],
  }))
}

export interface ScorePoint {
  label: string
  nota: number
}

/** Evolucao da nota oficial: comeca na nota de criacao e desce a cada mudanca. */
export function scoreTimeline(goal: CourageGoal, changes: CourageScoreChange[]): ScorePoint[] {
  const mine = changes
    .filter((c) => c.goal_id === goal.id)
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at))

  const first = mine.length > 0 ? mine[0].from_score : goal.score
  const points: ScorePoint[] = [{ label: format(parseISO(goal.created_at), 'dd/MM'), nota: first }]
  for (const change of mine) {
    points.push({ label: format(parseISO(change.changed_at), 'dd/MM'), nota: change.to_score })
  }
  return points
}

/* -------------------------------------------------------------- painel */

const weekKey = (date: Date): string => format(startOfWeek(date, { weekStartsOn: 1 }), 'dd/MM')

export interface WeekPoint {
  label: string
  tentativas: number
}

/** Tentativas completas por semana, nas ultimas `count` semanas. */
export function attemptsPerWeek(
  attempts: CourageAttempt[],
  count = 12,
  today = new Date(),
): WeekPoint[] {
  const completed = completedOf(attempts)
  const buckets = new Map<string, number>()
  for (const attempt of completed) {
    const date = parseISO(attempt.completed_at ?? attempt.planned_at)
    const age = differenceInCalendarWeeks(today, date, { weekStartsOn: 1 })
    if (age < 0 || age >= count) continue
    const key = weekKey(date)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  const points: WeekPoint[] = []
  for (let back = count - 1; back >= 0; back--) {
    const date = new Date(today)
    date.setDate(date.getDate() - back * 7)
    const key = weekKey(date)
    points.push({ label: key, tentativas: buckets.get(key) ?? 0 })
  }
  return points
}

/**
 * Semanas seguidas batendo a meta. A semana atual so entra se JA bateu — no
 * meio da semana ninguem esta devendo nada ainda.
 */
export function weeklyStreak(
  attempts: CourageAttempt[],
  target: number,
  today = new Date(),
): number {
  if (target <= 0) return 0
  const weeks = attemptsPerWeek(attempts, 52, today)
  let streak = 0
  for (let index = weeks.length - 1; index >= 0; index--) {
    const done = weeks[index].tentativas >= target
    if (index === weeks.length - 1 && !done) continue // semana corrente em aberto
    if (done) streak++
    else break
  }
  return streak
}

export interface DistributionPoint {
  label: string
  objetivos: number
}

/** Quantos objetivos ativos em cada nota — a foto da escada inteira. */
export function scoreDistribution(goals: CourageGoal[]): DistributionPoint[] {
  const counts = new Array<number>(COURAGE_MAX_SCORE + 1).fill(0)
  for (const goal of goals) {
    if (goal.archived) continue
    counts[clampScore(goal.score)]++
  }
  return counts.map((objetivos, score) => ({ label: String(score), objetivos }))
}

export interface OverallPoint {
  label: string
  media: number
}

/**
 * Media das notas dos objetivos ativos ao longo do tempo, reconstruida a
 * partir do historico de mudancas: queda = a escada inteira ficando mais facil.
 */
export function overallScoreSeries(
  goals: CourageGoal[],
  changes: CourageScoreChange[],
  today = new Date(),
): OverallPoint[] {
  const active = goals.filter((g) => !g.archived)
  if (active.length === 0) return []

  const events = changes
    .filter((c) => active.some((g) => g.id === c.goal_id))
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at))

  // Estado inicial: a nota que cada objetivo tinha antes da primeira mudanca.
  const current = new Map<string, number>()
  for (const goal of active) {
    const first = events.find((c) => c.goal_id === goal.id)
    current.set(goal.id, first ? first.from_score : goal.score)
  }

  const average = () => round1(mean([...current.values()]))

  const start = active.map((g) => g.created_at).sort()[0]
  const points: OverallPoint[] = [{ label: format(parseISO(start), 'dd/MM'), media: average() }]

  for (const event of events) {
    current.set(event.goal_id, event.to_score)
    points.push({ label: format(parseISO(event.changed_at), 'dd/MM'), media: average() })
  }

  points.push({ label: format(today, 'dd/MM'), media: average() })
  return points
}

export interface OverallStats {
  goals: number
  normalized: number
  attempts: number
  completed: number
  bias: number
  okRate: number | null
  confidence: Confidence
}

export function overallStats(goals: CourageGoal[], attempts: CourageAttempt[]): OverallStats {
  const stats = goalStats(attempts)
  const active = goals.filter((g) => !g.archived)
  return {
    goals: active.length,
    normalized: active.filter((g) => g.normalized_at !== null).length,
    attempts: attempts.length,
    completed: stats.completed,
    bias: stats.bias,
    okRate: stats.okRate,
    confidence: stats.confidence,
  }
}

/* ------------------------------------------------------------- padroes */

/** Minimo de tentativas para a analise de padroes abrir. */
export const PATTERN_MIN_ATTEMPTS = 15

export const periodOf = (iso: string): CouragePeriod => {
  const hour = parseISO(iso).getHours()
  if (hour < 12) return 'manha'
  if (hour < 18) return 'tarde'
  return 'noite'
}

export interface PatternGroup {
  key: string
  label: string
  count: number
  avgActual: number
}

export interface Patterns {
  available: boolean
  byPeriod: PatternGroup[]
  byPlace: PatternGroup[]
  byPeople: PatternGroup[]
  byEnergy: PatternGroup[]
}

const groupBy = (
  attempts: Array<CourageAttempt & { actual: number }>,
  keyOf: (a: CourageAttempt & { actual: number }) => string | null,
  labelOf: (key: string) => string,
): PatternGroup[] => {
  const map = new Map<string, number[]>()
  for (const attempt of attempts) {
    const key = keyOf(attempt)
    if (key === null) continue
    const list = map.get(key)
    if (list) list.push(attempt.actual)
    else map.set(key, [attempt.actual])
  }
  return (
    [...map.entries()]
      // Grupo com uma tentativa so nao e padrao, e anedota.
      .filter(([, values]) => values.length >= 2)
      .map(([key, values]) => ({
        key,
        label: labelOf(key),
        count: values.length,
        avgActual: round1(mean(values)),
      }))
      .sort((a, b) => a.avgActual - b.avgActual)
  )
}

export function patternBreakdown(
  attempts: CourageAttempt[],
  labels: {
    period: Record<CouragePeriod, string>
    place: Record<CouragePlace, string>
    people: Record<CouragePeople, string>
  },
): Patterns {
  const completed = completedOf(attempts)
  if (completed.length < PATTERN_MIN_ATTEMPTS) {
    return { available: false, byPeriod: [], byPlace: [], byPeople: [], byEnergy: [] }
  }
  return {
    available: true,
    byPeriod: groupBy(
      completed,
      (a) => periodOf(a.completed_at ?? a.planned_at),
      (key) => labels.period[key as CouragePeriod],
    ),
    byPlace: groupBy(
      completed,
      (a) => a.place,
      (key) => labels.place[key as CouragePlace],
    ),
    byPeople: groupBy(
      completed,
      (a) => a.people,
      (key) => labels.people[key as CouragePeople],
    ),
    byEnergy: groupBy(
      completed,
      (a) => (a.energy === null ? null : String(a.energy)),
      (key) => `Energia ${key}`,
    ),
  }
}
