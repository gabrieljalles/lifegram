import {
  differenceInCalendarDays,
  addDays,
  eachDayOfInterval,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns'
import type { AppSettings, Exercise, Routine, Session, SetLog, Weekday } from './types'

/* --------------------------------------------------------- fundamentais */

/** Volume de uma serie: o trabalho total levantado nela. */
export const setVolume = (log: Pick<SetLog, 'reps' | 'weight'>): number => log.reps * log.weight

export const totalVolume = (logs: Array<Pick<SetLog, 'reps' | 'weight'>>): number =>
  logs.reduce((sum, log) => sum + setVolume(log), 0)

/**
 * 1RM estimado pela formula de Epley: peso x (1 + reps/30).
 * Serve para comparar series de faixas diferentes — 60kg x 10 contra 70kg x 6 —
 * numa unica escala de forca.
 */
export function epley1RM(weight: number, reps: number): number {
  if (weight === 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export const logE1RM = (log: Pick<SetLog, 'reps' | 'weight'>): number =>
  epley1RM(log.weight, log.reps)

/* ---------------------------------------------------------- regressao */

export interface Trend {
  /** Inclinacao ja normalizada para 30 dias (unidade do eixo y por mes). */
  perMonth: number
  /** Mesma inclinacao em % sobre o valor previsto no inicio da janela. */
  percentPerMonth: number
  /** Quantos pontos entraram na conta. */
  points: number
  /** R^2 da reta: o quanto a progressao e consistente (0 a 1). */
  r2: number
  /** false quando ha menos de 3 pontos — nao da para falar em tendencia. */
  reliable: boolean
}

/**
 * Regressao linear simples de y sobre o tempo. `x` vem em dias desde o
 * primeiro ponto, entao a inclinacao e "unidade por dia" e multiplicamos por
 * 30 para virar "por mes".
 */
export function linearTrend(points: Array<{ date: Date; value: number }>): Trend {
  const n = points.length
  const empty: Trend = { perMonth: 0, percentPerMonth: 0, points: n, r2: 0, reliable: false }
  if (n < 2) return empty

  const t0 = points[0].date.getTime()
  const xs = points.map((p) => (p.date.getTime() - t0) / 86_400_000)
  const ys = points.map((p) => p.value)

  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  // Todas as sessoes no mesmo dia: sem eixo x nao existe inclinacao.
  if (sxx === 0) return empty

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const r2 = syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)))

  const perMonth = slope * 30
  const base = intercept > 0 ? intercept : meanY
  const percentPerMonth = base > 0 ? (perMonth / base) * 100 : 0

  return { perMonth, percentPerMonth, points: n, r2, reliable: n >= 3 }
}

/* ------------------------------------------------- agregacao por sessao */

export interface ExerciseSessionPoint {
  session_id: string
  date: Date
  /** Maior carga usada no exercicio naquela sessao. */
  topWeight: number
  /** Maior 1RM estimado entre as series daquela sessao. */
  bestE1RM: number
  /** Soma de reps x peso de todas as series do exercicio na sessao. */
  volume: number
  sets: number
  reps: number
  /** Menor numero de reps entre as series — base da dupla progressao por faixa. */
  minReps: number
}

/** Colapsa as series de um exercicio em um ponto por sessao (ou por dia). */
export function exerciseSessionPoints(logs: SetLog[]): ExerciseSessionPoint[] {
  const bySession = new Map<string, SetLog[]>()
  for (const log of logs) {
    const list = bySession.get(log.session_id)
    if (list) list.push(log)
    else bySession.set(log.session_id, [log])
  }

  const points: ExerciseSessionPoint[] = []
  for (const [session_id, group] of bySession) {
    const dates = group.map((l) => parseISO(l.completed_at).getTime())
    points.push({
      session_id,
      date: new Date(Math.min(...dates)),
      topWeight: Math.max(...group.map((l) => l.weight)),
      bestE1RM: Math.max(...group.map(logE1RM)),
      volume: totalVolume(group),
      sets: group.length,
      reps: group.reduce((sum, l) => sum + l.reps, 0),
      minReps: Math.min(...group.map((l) => l.reps)),
    })
  }
  return points.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export interface ExerciseSummary {
  points: ExerciseSessionPoint[]
  sessions: number
  totalSets: number
  totalReps: number
  totalVolume: number
  /** Maior carga ja levantada no exercicio. */
  prWeight: number
  /** Maior volume em uma unica serie. */
  prSetVolume: number
  bestE1RM: number
  /** Tendencia do 1RM estimado: o indicador principal de progresso. */
  trendE1RM: Trend
  /** Tendencia da carga de topo, em kg/mes — mais intuitivo de ler. */
  trendTopWeight: Trend
  lastDate: Date | null
  daysSinceLast: number | null
  /** Media de sessoes por semana desde a primeira vez que fez o exercicio. */
  sessionsPerWeek: number
}

export function summarizeExercise(logs: SetLog[], today = new Date()): ExerciseSummary {
  const points = exerciseSessionPoints(logs)
  const lastDate = points.length ? points[points.length - 1].date : null
  const firstDate = points.length ? points[0].date : null

  const spanWeeks =
    firstDate && lastDate ? Math.max(1, (differenceInCalendarDays(lastDate, firstDate) + 1) / 7) : 1

  return {
    points,
    sessions: points.length,
    totalSets: logs.length,
    totalReps: logs.reduce((sum, l) => sum + l.reps, 0),
    totalVolume: totalVolume(logs),
    prWeight: logs.length ? Math.max(...logs.map((l) => l.weight)) : 0,
    prSetVolume: logs.length ? Math.max(...logs.map(setVolume)) : 0,
    bestE1RM: logs.length ? Math.max(...logs.map(logE1RM)) : 0,
    trendE1RM: linearTrend(points.map((p) => ({ date: p.date, value: p.bestE1RM }))),
    trendTopWeight: linearTrend(points.map((p) => ({ date: p.date, value: p.topWeight }))),
    lastDate,
    daysSinceLast: lastDate ? differenceInCalendarDays(today, lastDate) : null,
    sessionsPerWeek: points.length / spanWeeks,
  }
}

/* --------------------------------------------- comparacao entre series */

export interface SetComparison {
  weightDelta: number
  repsDelta: number
  e1rmDelta: number
  /** Texto pronto em pt-BR, ex.: "mesma carga, +2 reps". */
  label: string
  direction: 'up' | 'down' | 'same'
}

/**
 * Compara a serie engatilhada com uma serie de referencia.
 *
 * O veredito vem do 1RM estimado, nao da carga: 44 kg x 12 e melhor que
 * 45 kg x 8, e olhar so o peso mentiria dizendo que voce piorou. Carga e
 * repeticoes aparecem separadas no texto para voce ver o que mudou.
 */
export function compareSets(
  current: Pick<SetLog, 'reps' | 'weight'>,
  reference: Pick<SetLog, 'reps' | 'weight'>,
): SetComparison {
  const weightDelta = Math.round((current.weight - reference.weight) * 10) / 10
  const repsDelta = current.reps - reference.reps
  const e1rmDelta = Math.round((logE1RM(current) - logE1RM(reference)) * 100) / 100

  const plural = (n: number) => (Math.abs(n) === 1 ? 'rep' : 'reps')
  const signed = (n: number) => (n > 0 ? `+${formatWeight(n)}` : formatWeight(n))

  let label: string
  if (weightDelta === 0 && repsDelta === 0) {
    label = 'igual à última'
  } else {
    const parts = [
      weightDelta === 0 ? 'mesma carga' : `${signed(weightDelta)} kg`,
      repsDelta === 0
        ? 'mesmas reps'
        : `${repsDelta > 0 ? '+' : ''}${repsDelta} ${plural(repsDelta)}`,
    ]
    label = parts.join(', ')
  }

  return {
    weightDelta,
    repsDelta,
    e1rmDelta,
    label,
    direction: e1rmDelta > 0.01 ? 'up' : e1rmDelta < -0.01 ? 'down' : 'same',
  }
}

/** A melhor serie de um conjunto, medida pelo 1RM estimado. */
export function bestSet<T extends Pick<SetLog, 'reps' | 'weight'>>(sets: T[]): T | null {
  if (sets.length === 0) return null
  return sets.reduce((best, set) => (logE1RM(set) > logE1RM(best) ? set : best))
}

/* ------------------------------------------------------ dupla progressao */

export interface ProgressionSuggestion {
  action: 'increase' | 'decrease' | 'deload'
  /** Carga sugerida para a proxima vez. */
  weight: number
  /** Carga de topo da sessao que disparou a sugestao. */
  from: number
  /** Texto pronto em pt-BR explicando o motivo da sugestao. */
  reason: string
}

/** Sessoes usadas para julgar se o 1RM estimado estagnou (plato). */
const DELOAD_WINDOW_SESSIONS = 5
/** Minimo de sessoes na janela para a tendencia de plato nao ser so ruido. */
const DELOAD_MIN_SESSIONS = 4

/**
 * Recomendacao de carga por dupla progressao numa faixa de repeticoes —
 * nunca aplica a mudanca sozinha, so sugere. Trabalha sobre a ultima sessao
 * do exercicio (e, para o plato, sobre a tendencia das ultimas sessoes):
 *
 * 1. Cardio nao progride por carga.
 * 2. Caiu abaixo do piso da faixa em alguma serie -> carga pesada demais,
 *    sugere baixar (regra classica de dupla progressao: se nem o minimo da
 *    faixa foi cumprido, o estimulo pretendido nao foi atingido).
 * 3. Bateu o teto da faixa em TODAS as series -> sugere subir, como antes.
 * 4. Nenhum dos dois, mas o 1RM estimado das ultimas sessoes esta estagnado
 *    ou caindo -> sugere um treino mais leve (deload), pratica usual em
 *    periodizacao/autorregulacao para destravar plato.
 *
 * O recuo do deload e sempre aditivo em unidades de `increment` (nunca um
 * percentual multiplicado direto na carga): numa carga assistida negativa,
 * "mais facil" significa um numero mais negativo, e multiplicar por 0,9
 * andaria na direcao errada. Somar/subtrair increments funciona igual nos
 * dois sentidos da escala.
 */
export function suggestProgression(
  logs: SetLog[],
  exercise: Pick<Exercise, 'rep_floor' | 'rep_ceiling' | 'weight_increment' | 'muscle_group'>,
): ProgressionSuggestion | null {
  if (exercise.muscle_group === 'cardio') return null

  const floor = exercise.rep_floor
  const ceiling = exercise.rep_ceiling
  const increment = exercise.weight_increment
  if (floor <= 0 || ceiling <= 0 || increment <= 0 || floor >= ceiling) return null

  const points = exerciseSessionPoints(logs)
  if (points.length === 0) return null
  const last = points[points.length - 1]

  if (last.minReps < floor) {
    return {
      action: 'decrease',
      weight: Math.round((last.topWeight - increment) * 10) / 10,
      from: last.topWeight,
      reason: `Na última vez você fez ${last.minReps} repetições — abaixo do piso de ${floor}. Baixar a carga ajuda a voltar para a faixa.`,
    }
  }

  if (last.minReps >= ceiling) {
    return {
      action: 'increase',
      weight: Math.round((last.topWeight + increment) * 10) / 10,
      from: last.topWeight,
      reason: `Na última vez você bateu ${ceiling}+ repetições em todas as séries. Subir a carga mantém o estímulo.`,
    }
  }

  const window = points.slice(-DELOAD_WINDOW_SESSIONS)
  if (window.length >= DELOAD_MIN_SESSIONS) {
    const trend = linearTrend(window.map((p) => ({ date: p.date, value: p.bestE1RM })))
    if (trend.reliable && trend.perMonth <= 0) {
      const steps = Math.max(1, Math.round((Math.abs(last.topWeight) * 0.1) / increment))
      return {
        action: 'deload',
        weight: Math.round((last.topWeight - increment * steps) * 10) / 10,
        from: last.topWeight,
        reason: `Sem progresso nas últimas ${window.length} sessões. Um treino mais leve pode ajudar a destravar.`,
      }
    }
  }

  return null
}

/* ---------------------------------------------------- tempo de treino */

export interface TimeBreakdown {
  totalSeconds: number
  /** Soma dos descansos realmente cronometrados. */
  restSeconds: number
  /** O resto: executar as series, trocar de aparelho, ajustar a carga. */
  activeSeconds: number
  restShare: number
  /** Media de descanso por intervalo medido. */
  avgRestSeconds: number
  /** Media do descanso planejado, para comparar com o que voce faz. */
  avgPlannedSeconds: number
  measuredIntervals: number
}

/**
 * Separa o treino entre descanso e trabalho.
 *
 * "Tempo ativo" e o que sobra do descanso cronometrado — inclui executar a
 * serie, mas tambem andar ate o aparelho e trocar a anilha. Nao e tempo sob
 * tensao no sentido estrito: medir isso exigiria cronometrar cada serie.
 */
export function timeBreakdown(
  session: Pick<Session, 'duration_seconds'>,
  logs: Array<Pick<SetLog, 'rest_taken_seconds'>>,
  plannedRestSeconds: number[] = [],
): TimeBreakdown {
  const totalSeconds = Math.max(0, session.duration_seconds)
  // A primeira serie do treino nao tem descanso antes: nao entra na media.
  const measured = logs.map((log) => log.rest_taken_seconds).filter((value) => value > 0)
  const restSeconds = Math.min(
    totalSeconds,
    measured.reduce((sum, value) => sum + value, 0),
  )

  const planned = plannedRestSeconds.filter((value) => value > 0)

  return {
    totalSeconds,
    restSeconds,
    activeSeconds: Math.max(0, totalSeconds - restSeconds),
    restShare: totalSeconds > 0 ? restSeconds / totalSeconds : 0,
    avgRestSeconds: measured.length ? restSeconds / measured.length : 0,
    avgPlannedSeconds: planned.length
      ? planned.reduce((sum, value) => sum + value, 0) / planned.length
      : 0,
    measuredIntervals: measured.length,
  }
}

/**
 * Como uma serie se escreve numa linha: "40 kg x 12" ou "1:30" quando e
 * cronometrada. Uma funcao so para as quatro telas nao divergirem.
 */
export function setLabel(
  log: Pick<SetLog, 'reps' | 'weight'> & { duration_seconds?: number | null },
  { withUnit = false } = {},
): string {
  const seconds = log.duration_seconds ?? null
  if (seconds !== null) {
    return log.weight !== 0 ? `${formatWeight(log.weight)} kg · ${formatClock(seconds)}` : formatClock(seconds)
  }
  return withUnit
    ? `${formatWeight(log.weight)} kg × ${log.reps}`
    : `${formatWeight(log.weight)}×${log.reps}`
}

/* ------------------------------------------------------------- recordes */

export interface PRCheck {
  is_pr_weight: boolean
  is_pr_volume: boolean
}

type PRInput = Pick<SetLog, 'reps' | 'weight'> & { duration_seconds?: number | null }

/**
 * Compara uma serie recem-feita com todo o historico anterior do exercicio.
 * Empatar nao conta como recorde: o recorde tem que ser superado.
 *
 * Exercicio cronometrado tem outra regra: o recorde e o TEMPO (prancha mais
 * longa), e a carga so entra quando ha carga — prancha com colete que dura o
 * mesmo tempo com mais peso tambem e recorde.
 */
export function checkPR(candidate: PRInput, history: PRInput[]): PRCheck {
  const timed = (candidate.duration_seconds ?? null) !== null
  if (timed) {
    const seconds = candidate.duration_seconds as number
    if (seconds <= 0) return { is_pr_weight: false, is_pr_volume: false }
    const past = history.filter((log) => (log.duration_seconds ?? null) !== null)
    const bestTime = past.length
      ? Math.max(...past.map((log) => log.duration_seconds as number))
      : -Infinity
    const bestWeight = past.length ? Math.max(...past.map((log) => log.weight)) : -Infinity
    return {
      is_pr_weight: candidate.weight !== 0 && candidate.weight > bestWeight,
      is_pr_volume: seconds > bestTime,
    }
  }

  if (candidate.weight === 0 || candidate.reps <= 0) {
    return { is_pr_weight: false, is_pr_volume: false }
  }
  // Series cronometradas nao entram: comparar 40 s com 12 reps nao significa nada.
  const past = history.filter((log) => (log.duration_seconds ?? null) === null)
  // -Infinity (nao 0): carga assistida (negativa) tambem precisa contar como recorde na primeira vez.
  const bestWeight = past.length ? Math.max(...past.map((l) => l.weight)) : -Infinity
  const bestVolume = past.length ? Math.max(...past.map(setVolume)) : -Infinity
  return {
    is_pr_weight: candidate.weight > bestWeight,
    is_pr_volume: setVolume(candidate) > bestVolume,
  }
}

/* -------------------------------------------------------------- streak */

export interface StreakInfo {
  current: number
  longest: number
  /** Dias treinados no formato yyyy-MM-dd. */
  days: string[]
  lastTrainedAt: Date | null
}

/**
 * Sequencia de treinos. Como ninguem treina 7 dias por semana, a corrente so
 * quebra depois de `toleranceDays` dias parado — dia de descanso nao pune.
 * O que contamos e o numero de DIAS TREINADOS na sequencia, nao dias corridos.
 */
export function computeStreak(
  sessions: Array<Pick<Session, 'started_at' | 'finished_at'>>,
  today = new Date(),
  toleranceDays = 2,
): StreakInfo {
  const days = Array.from(
    new Set(
      sessions
        .filter((s) => s.finished_at)
        .map((s) => format(startOfDay(parseISO(s.started_at)), 'yyyy-MM-dd')),
    ),
  ).sort()

  if (days.length === 0) {
    return { current: 0, longest: 0, days, lastTrainedAt: null }
  }

  const dates = days.map((d) => parseISO(d))
  let longest = 1
  let run = 1
  for (let i = 1; i < dates.length; i++) {
    const gap = differenceInCalendarDays(dates[i], dates[i - 1])
    run = gap <= toleranceDays ? run + 1 : 1
    if (run > longest) longest = run
  }

  const lastTrainedAt = dates[dates.length - 1]
  const gapToToday = differenceInCalendarDays(startOfDay(today), lastTrainedAt)

  let current = 0
  if (gapToToday <= toleranceDays) {
    current = 1
    for (let i = dates.length - 1; i > 0; i--) {
      if (differenceInCalendarDays(dates[i], dates[i - 1]) <= toleranceDays) current++
      else break
    }
  }

  return { current, longest, days, lastTrainedAt }
}

/* ------------------------------------------------------------- agenda */

export interface Schedule {
  /** Dias da semana em que algum treino e cobrado. */
  dueDays: Weekday[]
  /** Dias declarados como descanso: nunca cobram, mesmo com treino marcado. */
  restDays: Weekday[]
}

/**
 * Monta a agenda a partir dos treinos e dos ajustes. Dia de descanso vence o
 * dia marcado no treino: quem pediu folga na quarta nao quer ser cobrado nela.
 */
export function scheduleOf(
  routines: Routine[],
  settings: Pick<AppSettings, 'rest_days'>,
): Schedule {
  const rest = new Set<Weekday>(settings.rest_days)
  const due = new Set<Weekday>()
  for (const routine of routines) {
    if (routine.archived) continue
    for (const day of routine.scheduled_days ?? []) {
      if (!rest.has(day)) due.add(day)
    }
  }
  return { dueDays: [...due].sort(), restDays: [...rest].sort() }
}

/** Treinos marcados para um dia da semana, na ordem em que aparecem na Home. */
export function routinesForDay(routines: Routine[], weekday: Weekday): Routine[] {
  return routines
    .filter((r) => !r.archived && (r.scheduled_days ?? []).includes(weekday))
    .sort((a, b) => a.position - b.position)
}

export interface ScheduleStreak extends StreakInfo {
  /** 'agenda' = corrente por compromisso cumprido; 'livre' = por tolerancia. */
  mode: 'agenda' | 'livre'
  /** Hoje e dia cobrado e ainda nao treinou — a corrente esta em risco. */
  pendingToday: boolean
  /** Hoje e dia de descanso declarado. */
  restToday: boolean
  /** Ultimo dia cobrado que ficou em branco (yyyy-MM-dd), se houver. */
  missedAt: string | null
}

const trainedDayKeys = (sessions: Array<Pick<Session, 'started_at' | 'finished_at'>>): string[] =>
  Array.from(
    new Set(
      sessions
        .filter((s) => s.finished_at)
        .map((s) => format(startOfDay(parseISO(s.started_at)), 'yyyy-MM-dd')),
    ),
  ).sort()

/**
 * Corrente por agenda: conta dias cobrados seguidos que foram cumpridos.
 *
 * Regras que vieram do uso real:
 * - faltar num dia cobrado zera — e esse o compromisso;
 * - treinar em dia de descanso ou em dia livre entra no historico e nos
 *   graficos, mas nao mexe na corrente (nem soma, nem quebra);
 * - hoje nunca quebra: o dia so e cobrado depois que vira;
 * - a cobranca e por DIA, nao por treino especifico — se o dia era de pernas e
 *   voce fez costas, o compromisso do dia valeu;
 * - sem nenhum dia marcado, cai na corrente por tolerancia (comportamento
 *   antigo), senao quem nunca montou agenda ficaria sem corrente nenhuma.
 */
export function computeScheduleStreak(
  sessions: Array<Pick<Session, 'started_at' | 'finished_at'>>,
  schedule: Schedule,
  today = new Date(),
): ScheduleStreak {
  const end = startOfDay(today)
  const restToday = schedule.restDays.includes(end.getDay() as Weekday)
  const due = new Set<Weekday>(schedule.dueDays)

  if (due.size === 0) {
    const legacy = computeStreak(sessions, today)
    return { ...legacy, mode: 'livre', pendingToday: false, restToday, missedAt: null }
  }

  const days = trainedDayKeys(sessions)
  if (days.length === 0) {
    return {
      current: 0,
      longest: 0,
      days,
      lastTrainedAt: null,
      mode: 'agenda',
      pendingToday: due.has(end.getDay() as Weekday),
      restToday,
      missedAt: null,
    }
  }

  const trained = new Set(days)
  const todayKey = format(end, 'yyyy-MM-dd')
  let run = 0
  let longest = 0
  let missedAt: string | null = null

  // A cobranca so comeca no primeiro treino registrado: nao faz sentido punir
  // por dias anteriores a existencia do historico.
  for (let day = parseISO(days[0]); day <= end; day = addDays(day, 1)) {
    const key = format(day, 'yyyy-MM-dd')
    if (!due.has(day.getDay() as Weekday)) continue
    if (trained.has(key)) {
      run++
      if (run > longest) longest = run
    } else if (key !== todayKey) {
      if (run > 0) missedAt = key
      run = 0
    }
  }

  return {
    current: run,
    longest,
    days,
    lastTrainedAt: parseISO(days[days.length - 1]),
    mode: 'agenda',
    pendingToday: due.has(end.getDay() as Weekday) && !trained.has(todayKey),
    restToday,
    missedAt,
  }
}

export interface HeatmapDay {
  date: Date
  key: string
  volume: number
  sessions: number
}

/** Calendario dos ultimos `days` dias, para o heatmap da home. */
export function heatmapDays(
  sessions: Session[],
  logs: SetLog[],
  days = 119,
  today = new Date(),
): HeatmapDay[] {
  const end = startOfDay(today)
  const start = subDays(end, days - 1)

  const volumeByDay = new Map<string, number>()
  for (const log of logs) {
    const key = format(startOfDay(parseISO(log.completed_at)), 'yyyy-MM-dd')
    volumeByDay.set(key, (volumeByDay.get(key) ?? 0) + setVolume(log))
  }

  const sessionsByDay = new Map<string, number>()
  for (const s of sessions) {
    if (!s.finished_at) continue
    const key = format(startOfDay(parseISO(s.started_at)), 'yyyy-MM-dd')
    sessionsByDay.set(key, (sessionsByDay.get(key) ?? 0) + 1)
  }

  return eachDayOfInterval({ start, end }).map((date) => {
    const key = format(date, 'yyyy-MM-dd')
    return {
      date,
      key,
      volume: volumeByDay.get(key) ?? 0,
      sessions: sessionsByDay.get(key) ?? 0,
    }
  })
}

/* ------------------------------------------------ agregacao por periodo */

export type Period = 'week' | 'month' | 'year'

export interface Bucket {
  key: string
  label: string
  start: Date
  volume: number
  sessions: number
  sets: number
  reps: number
  prs: number
}

const bucketStart = (date: Date, period: Period): Date => {
  if (period === 'week') return startOfWeek(date, { weekStartsOn: 1 })
  if (period === 'month') return startOfMonth(date)
  return startOfYear(date)
}

/**
 * Chave da semana (segunda a domingo) que a data pertence, no formato
 * YYYY-MM-DD. Duas datas na mesma semana sempre devolvem a mesma chave —
 * base do lembrete semanal de peso corporal.
 */
export const weekKeyOf = (date: Date): string =>
  format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')

/**
 * Interpreta uma data "solta" (YYYY-MM-DD, sem hora) como meia-noite LOCAL,
 * nao UTC. `parseISO('2026-03-09')` sozinho cairia em meia-noite UTC, que em
 * fusos negativos (Brasil, UTC-3) representa a noite do dia anterior — um
 * problema justamente para virada de semana/dia. Usado pelo peso corporal,
 * que so guarda a data (`logged_at`), nunca hora.
 */
export const parseLocalDate = (yyyyMMdd: string): Date => parseISO(`${yyyyMMdd}T00:00:00`)

const bucketLabel = (date: Date, period: Period): string => {
  if (period === 'week') return format(date, 'dd/MM')
  if (period === 'month') return format(date, 'MM/yy')
  return format(date, 'yyyy')
}

/**
 * Agrupa volume/sessoes/PRs por semana, mes ou ano, devolvendo tambem os
 * periodos vazios — um buraco no grafico e informacao, nao ruido.
 */
export function bucketize(
  sessions: Session[],
  logs: SetLog[],
  period: Period,
  count: number,
  today = new Date(),
): Bucket[] {
  const step = (date: Date, back: number): Date => {
    const d = new Date(date)
    if (period === 'week') d.setDate(d.getDate() - 7 * back)
    else if (period === 'month') d.setMonth(d.getMonth() - back)
    else d.setFullYear(d.getFullYear() - back)
    return bucketStart(d, period)
  }

  const current = bucketStart(today, period)
  const buckets = new Map<string, Bucket>()
  for (let i = count - 1; i >= 0; i--) {
    const start = step(current, i)
    const key = format(start, 'yyyy-MM-dd')
    buckets.set(key, {
      key,
      label: bucketLabel(start, period),
      start,
      volume: 0,
      sessions: 0,
      sets: 0,
      reps: 0,
      prs: 0,
    })
  }

  for (const log of logs) {
    const key = format(bucketStart(parseISO(log.completed_at), period), 'yyyy-MM-dd')
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.volume += setVolume(log)
    bucket.sets += 1
    bucket.reps += log.reps
    if (log.is_pr_weight || log.is_pr_volume) bucket.prs += 1
  }

  for (const session of sessions) {
    if (!session.finished_at) continue
    const key = format(bucketStart(parseISO(session.started_at), period), 'yyyy-MM-dd')
    const bucket = buckets.get(key)
    if (bucket) bucket.sessions += 1
  }

  return [...buckets.values()]
}

/** Variacao percentual entre os dois ultimos periodos fechados. */
export function periodDelta(buckets: Bucket[], field: 'volume' | 'sessions' = 'volume'): number {
  if (buckets.length < 2) return 0
  const current = buckets[buckets.length - 1][field]
  const previous = buckets[buckets.length - 2][field]
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

/* ------------------------------------------------------------ formato */

export function formatVolume(kg: number): string {
  const br = (value: number, digits: number) => value.toFixed(digits).replace('.', ',')
  if (kg >= 1_000_000) return `${br(kg / 1_000_000, 1)}M kg`
  if (kg >= 1000) return `${br(kg / 1000, kg >= 10_000 ? 0 : 1)}t`
  return `${Math.round(kg)} kg`
}

export function formatWeight(kg: number): string {
  const rounded = Math.round(kg * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
