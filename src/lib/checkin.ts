import { addDays, format, parseISO } from 'date-fns'
import { putCheckin } from './db'
import type { AppSettings, Checkin, CheckinFactor, FactorValue, Session } from './types'
import { newId, nowISO } from './types'

/**
 * Check-in da noite: como foi o dia (parte 1) e o que pode pesar amanha
 * (parte 2). Tudo puro aqui, menos `saveCheckin`, para os testes e as telas
 * calcularem a mesma coisa.
 */

export const DEFAULT_CHECKIN_TIME = '21:30'

/**
 * Sonhou na noite que passou. Fica nos fatores do dia em que voce acordou,
 * mas e perguntado de manha (sonho some da memoria ate a noite) e mostrado
 * junto com o sono, nao na lista da noite.
 */
export const DREAM_FACTOR = 'sonhou'

/** Ate esta hora a tela Hoje pergunta do sonho. */
export const DREAM_ASK_UNTIL_HOUR = 12

/** Treino depois deste horario conta como "treinou tarde". */
export const LATE_WORKOUT_HOUR = 20

/** Perguntas da parte 2. A ordem e a da tela. */
export const DEFAULT_FACTORS: CheckinFactor[] = [
  {
    id: 'alcool',
    label: 'Bebeu álcool?',
    kind: 'count',
    unit: 'doses',
    hint: 'lata, taça ou dose',
  },
  { id: 'sexo', label: 'Transou?', kind: 'bool' },
  { id: 'masturbacao', label: 'Se masturbou?', kind: 'bool' },
  { id: 'pornografia', label: 'Viu pornografia?', kind: 'bool' },
  { id: 'cafe_tarde', label: 'Café ou energético depois das 16h?', kind: 'bool' },
  { id: 'comida_tarde', label: 'Comeu pesado depois das 21h?', kind: 'bool' },
  { id: 'celular_cama', label: 'Celular na cama depois das 23h?', kind: 'bool' },
  {
    id: 'treino_tarde',
    label: 'Treinou depois das 20h?',
    kind: 'bool',
    hint: 'preenchido pelo treino registrado',
  },
  { id: 'cochilo', label: 'Cochilou de dia?', kind: 'bool' },
  { id: 'estresse', label: 'Briga ou estresse forte?', kind: 'bool' },
  { id: 'deitar', label: 'Vai deitar que horas?', kind: 'time' },
]

/** Palavras do dia: escolha rapida, ate 3. */
export const DAY_WORDS = [
  'focado',
  'cansado',
  'corajoso',
  'ansioso',
  'grato',
  'irritado',
  'tranquilo',
  'sozinho',
  'produtivo',
  'travado',
  'feliz',
  'triste',
]

export const MAX_WORDS = 3

export const HAPPINESS_LABELS = ['péssimo', 'ruim', 'ok', 'bom', 'ótimo']
export const SLEEP_QUALITY_LABELS = ['ruim', 'ok', 'bom']

/** Lista em uso: a dos ajustes, ou a padrao. */
export function factorsOf(settings: Pick<AppSettings, 'checkin_factors'>): CheckinFactor[] {
  return settings.checkin_factors ?? DEFAULT_FACTORS
}

export const activeFactors = (settings: Pick<AppSettings, 'checkin_factors'>) =>
  factorsOf(settings).filter((f) => !f.off)

export const checkinTimeOf = (settings: Pick<AppSettings, 'checkin_time'>) =>
  settings.checkin_time ?? DEFAULT_CHECKIN_TIME

export function checkinFor(checkins: Checkin[], day: string): Checkin | undefined {
  return checkins.find((c) => c.day === day)
}

/** Um check-in conta como feito quando a felicidade foi respondida. */
export const isClosed = (checkin: Checkin | undefined) => checkin?.happiness != null

export function emptyCheckin(day: string): Checkin {
  const at = nowISO()
  return {
    id: newId(),
    user_id: null,
    day,
    happiness: null,
    energy: null,
    sleep_minutes: null,
    sleep_quality: null,
    words: [],
    note: null,
    factors: {},
    deleted: false,
    created_at: at,
    updated_at: at,
  }
}

/**
 * Respostas que o app ja sabe: treinou depois das 20h sai do treino
 * registrado no dia. So preenche o que ainda nao foi respondido.
 */
export function autoFactors(
  day: string,
  sessions: Array<Pick<Session, 'started_at' | 'finished_at'>>,
): Record<string, FactorValue> {
  const that = sessions.filter(
    (s) => s.finished_at && format(parseISO(s.started_at), 'yyyy-MM-dd') === day,
  )
  if (that.length === 0) return {}
  const late = that.some((s) => parseISO(s.started_at).getHours() >= LATE_WORKOUT_HOUR)
  return { treino_tarde: late }
}

/** Liga ou desliga uma palavra, respeitando o maximo. */
export function toggleWord(words: string[], word: string): string[] {
  if (words.includes(word)) return words.filter((w) => w !== word)
  if (words.length >= MAX_WORDS) return words
  return [...words, word]
}

/** "7h10", "6h", "—". */
export function formatSleep(minutes: number | null | undefined): string {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** O dia anterior (YYYY-MM-DD). */
export const previousDay = (day: string) => format(addDays(parseISO(day), -1), 'yyyy-MM-dd')

/**
 * Hora de abrir o check-in: a partir do horario marcado, e ate as 4h da
 * madrugada seguinte o dia ainda e "ontem" para fechar.
 */
export function closingDay(now: Date): string {
  const date = now.getHours() < 4 ? addDays(now, -1) : now
  return format(date, 'yyyy-MM-dd')
}

export async function saveCheckin(checkin: Checkin) {
  await putCheckin({ ...checkin, updated_at: nowISO() })
}
