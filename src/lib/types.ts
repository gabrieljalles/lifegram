export type ID = string

export const MUSCLE_GROUPS = [
  'peito',
  'costas',
  'pernas',
  'gluteos',
  'ombros',
  'biceps',
  'triceps',
  'abdomen',
  'panturrilha',
  'cardio',
  'outro',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

/** Descanso padrao pedido pelo usuario: 1 minuto e 30 segundos. */
export const DEFAULT_REST_SECONDS = 90

/**
 * Dupla progressao: quando as repeticoes batem o teto em TODAS as series, a
 * carga sobe e as repeticoes voltam a cair sozinhas. Assim sempre existe para
 * onde progredir, mesmo quando subir peso ficou dificil.
 */
export const DEFAULT_REP_CEILING = 15

/** Menor salto de carga que voce consegue executar naquele aparelho. */
export const DEFAULT_WEIGHT_INCREMENT = 1

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
  /** Teto de repeticoes: ao bater em todas as series, o app sugere subir a carga. */
  rep_ceiling: number
  /** Quanto somar na carga quando a sugestao dispara. */
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
}

export interface ActiveItem {
  exercise_id: ID
  target_sets: number
  target_reps: number
  target_weight: number
  rest_seconds: number
}

export type SyncTable = 'exercises' | 'routines' | 'routine_exercises' | 'sessions' | 'set_logs'

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
