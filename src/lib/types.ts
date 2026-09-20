export type ID = string

export const MUSCLE_GROUPS = [
  'peito',
  'costas',
  'trapezio',
  'pernas',
  'gluteos',
  'ombros',
  'biceps',
  'triceps',
  'antebraco',
  'abdomen',
  'panturrilha',
  'cardio',
  'outro',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

/** Descanso padrao pedido pelo usuario: 1 minuto e 30 segundos. */
export const DEFAULT_REST_SECONDS = 90

/**
 * Dupla progressao dentro de uma faixa: entre o piso e o teto de repeticoes,
 * so as reps sobem sozinhas. Bater o teto em TODAS as series sugere subir a
 * carga; cair abaixo do piso em qualquer serie sugere baixar.
 */
export const DEFAULT_REP_CEILING = 12
export const DEFAULT_REP_FLOOR = 8

/**
 * Teto usado antes de 20/09/2026. Exercicios que ainda estao nele sao movidos
 * para o teto novo uma unica vez — quem mudou o valor na mao nao e tocado.
 */
export const LEGACY_REP_CEILING = 15

/** Menor salto de carga que voce consegue executar naquele aparelho. */
export const DEFAULT_WEIGHT_INCREMENT = 1

/** Dia da semana no padrao do JavaScript: 0 = domingo ... 6 = sabado. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const WEEKDAYS: Array<{ value: Weekday; short: string; label: string }> = [
  { value: 0, short: 'D', label: 'domingo' },
  { value: 1, short: 'S', label: 'segunda' },
  { value: 2, short: 'T', label: 'terça' },
  { value: 3, short: 'Q', label: 'quarta' },
  { value: 4, short: 'Q', label: 'quinta' },
  { value: 5, short: 'S', label: 'sexta' },
  { value: 6, short: 'S', label: 'sábado' },
]

/**
 * Preferencias do usuario que nao pertencem a nenhuma tabela. Ficam em `meta`
 * (IndexedDB) e viajam no backup JSON.
 */
export interface AppSettings {
  /** Dias em que nao ha cobranca: treinar neles conta, faltar neles nao pune. */
  rest_days: Weekday[]
  /** Quantas tentativas de coragem por semana voce quer bater. */
  courage_weekly_goal: number
  updated_at: string
}

/** Tres por semana: exposicao frequente o bastante para o medo ceder. */
export const DEFAULT_COURAGE_WEEKLY_GOAL = 3

export const DEFAULT_SETTINGS: AppSettings = {
  rest_days: [],
  courage_weekly_goal: DEFAULT_COURAGE_WEEKLY_GOAL,
  updated_at: '1970-01-01T00:00:00.000Z',
}

export interface Exercise {
  id: ID
  user_id: string | null
  name: string
  muscle_group: MuscleGroup
  /** URL no Supabase Storage (quando ja sincronizada). */
  photo_url: string | null
  /** Chave do blob local em IndexedDB — a foto funciona offline por aqui. */
  photo_local_key: string | null
  default_rest_seconds: number
  /** Piso da faixa de reps: cair abaixo dele sugere baixar a carga. */
  rep_floor: number
  /** Teto da faixa de reps: ao bater em todas as series, o app sugere subir a carga. */
  rep_ceiling: number
  /** Quanto somar ou tirar da carga quando uma sugestao dispara. */
  weight_increment: number
  notes: string | null
  archived: boolean
  updated_at: string
}

export interface Routine {
  id: ID
  user_id: string | null
  name: string
  position: number
  /**
   * Dias da semana em que este treino e cobrado. Lista vazia = treino sem dia
   * marcado: aparece como opcao livre e faltar nele nunca quebra a corrente.
   */
  scheduled_days: Weekday[]
  archived: boolean
  updated_at: string
}

export interface RoutineExercise {
  id: ID
  routine_id: ID
  exercise_id: ID
  position: number
  target_sets: number
  target_reps: number
  target_weight: number
  /** null = herda o default_rest_seconds do exercicio. */
  rest_seconds: number | null
  updated_at: string
}

export interface Session {
  id: ID
  user_id: string | null
  routine_id: ID | null
  routine_name: string
  started_at: string
  finished_at: string | null
  total_volume: number
  duration_seconds: number
  updated_at: string
}

export interface SetLog {
  id: ID
  session_id: ID
  user_id: string | null
  exercise_id: ID
  set_number: number
  reps: number
  weight: number
  completed_at: string
  /**
   * Descanso REAL medido ANTES desta serie (nao o planejado). E o que permite
   * separar, no resumo, quanto do treino foi descanso e quanto foi trabalho.
   */
  rest_taken_seconds: number
  is_pr_weight: boolean
  is_pr_volume: boolean
  updated_at: string
}

/** Estado do treino em andamento, persistido para sobreviver a fechar o app. */
export interface ActiveWorkout {
  session_id: ID
  routine_id: ID | null
  routine_name: string
  started_at: string
  /** indice do exercicio atual dentro de `items` */
  cursor: number
  /** serie atual do exercicio (1-based) */
  set_number: number
  items: ActiveItem[]
  /** timestamp (ms) em que o descanso atual termina; null = sem descanso rodando */
  rest_ends_at: number | null
  rest_total_seconds: number
  /** timestamp (ms) em que o descanso atual comecou, para medir o real. */
  rest_started_at: number | null
  /** Descanso real ja medido, aguardando ser gravado na proxima serie. */
  pending_rest_seconds: number
  /**
   * Exercicios adiados: foram empurrados para o fim da fila e voltam a
   * aparecer depois dos demais. Guardar os ids (e nao so a ordem) permite
   * avisar na tela que aquele exercicio e o que voltou.
   */
  postponed: ID[]
}

export interface ActiveItem {
  exercise_id: ID
  target_sets: number
  target_reps: number
  target_weight: number
  rest_seconds: number
}

/** Peso corporal, registrado no maximo uma vez por semana (lembrete no Inicio). */
export interface BodyWeightLog {
  id: ID
  user_id: string | null
  weight_kg: number
  /** Data (YYYY-MM-DD) que a medida representa. */
  logged_at: string
  updated_at: string
}

/* ------------------------------------------------------------- coragem */

/**
 * Escada do medo (hierarquia de exposicao da TCC). Cada objetivo tem uma nota
 * de 0 a 10: 10 e aterrorizante, 1 ainda e coragem em dose pequena e 0 quer
 * dizer "virou normal" — a meta final de todo degrau.
 */
export const COURAGE_MIN_SCORE = 0
export const COURAGE_MAX_SCORE = 10

/** Minimo de tentativas completas antes de qualquer conclusao estatistica. */
export const COURAGE_MIN_ATTEMPTS = 3

/** Quanto a nota real precisa ficar abaixo da prevista para sugerir reavaliar. */
export const COURAGE_REEVALUATE_GAP = 2

export type CourageStatus = 'andamento' | 'reavaliar' | 'normalizado'

export const COURAGE_STATUS_LABEL: Record<CourageStatus, string> = {
  andamento: 'Em andamento',
  reavaliar: 'Pronto para reavaliar',
  normalizado: 'Normalizado',
}

/** Categorias fixas: sem elas a analise de padroes nao consegue agrupar nada. */
export const COURAGE_PLACES = ['trabalho', 'casa', 'rua', 'online', 'evento', 'outro'] as const
export type CouragePlace = (typeof COURAGE_PLACES)[number]

export const COURAGE_PLACE_LABEL: Record<CouragePlace, string> = {
  trabalho: 'Trabalho',
  casa: 'Casa',
  rua: 'Rua',
  online: 'Online',
  evento: 'Evento',
  outro: 'Outro',
}

export const COURAGE_PEOPLE = [
  'conhecido',
  'colega',
  'desconhecido',
  'autoridade',
  'grupo',
] as const
export type CouragePeople = (typeof COURAGE_PEOPLE)[number]

export const COURAGE_PEOPLE_LABEL: Record<CouragePeople, string> = {
  conhecido: 'Conhecido',
  colega: 'Colega',
  desconhecido: 'Desconhecido',
  autoridade: 'Autoridade',
  grupo: 'Grupo',
}

/** Faixas de horario usadas na analise de padroes. */
export const COURAGE_PERIODS = ['manha', 'tarde', 'noite'] as const
export type CouragePeriod = (typeof COURAGE_PERIODS)[number]

export const COURAGE_PERIOD_LABEL: Record<CouragePeriod, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
}

export interface CourageGoal {
  id: ID
  user_id: string | null
  name: string
  description: string | null
  /** Nota oficial atual, 0 a 10. So muda por confirmacao sua. */
  score: number
  /** Objetivo maior do qual este e um degrau menor. null = degrau de topo. */
  parent_id: ID | null
  position: number
  /** Quando a nota chegou a 0 com as ultimas tentativas ok. */
  normalized_at: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

/**
 * Uma exposicao. Nasce com a previsao (antes de encarar) e so vira "completa"
 * quando a nota real e preenchida depois — e a diferenca entre as duas que
 * mostra o tamanho do exagero do medo.
 */
export interface CourageAttempt {
  id: ID
  user_id: string | null
  goal_id: ID
  /** Nota prevista, registrada ANTES de fazer. */
  predicted: number
  /** Nota real, registrada logo depois. null = previsao aguardando conclusao. */
  actual: number | null
  feared: string
  happened: string
  /** Resultado aceitavel segundo os fatos, nao segundo a sensacao do dia. */
  outcome_ok: boolean | null
  place: CouragePlace | null
  people: CouragePeople | null
  /** Nivel de energia de 1 a 5. */
  energy: number | null
  /** Observacao livre, fora das categorias. */
  note: string | null
  /** Quando a previsao foi salva. */
  planned_at: string
  /** Quando a nota real entrou. null = ainda em aberto. */
  completed_at: string | null
  updated_at: string
}

/** Historico de mudancas de nota: o diario do progresso de cada degrau. */
export interface CourageScoreChange {
  id: ID
  user_id: string | null
  goal_id: ID
  from_score: number
  to_score: number
  reason: string
  changed_at: string
  updated_at: string
}

export type SyncTable =
  | 'exercises'
  | 'routines'
  | 'routine_exercises'
  | 'sessions'
  | 'set_logs'
  | 'body_weight_logs'
  | 'courage_goals'
  | 'courage_attempts'
  | 'courage_score_changes'

export interface OutboxEntry {
  seq?: number
  table: SyncTable
  row_id: ID
  op: 'upsert' | 'delete'
  queued_at: string
}

export const nowISO = (): string => new Date().toISOString()

export const newId = (): ID =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
