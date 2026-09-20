import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  ActiveWorkout,
  AppSettings,
  BodyWeightLog,
  CourageAttempt,
  CourageGoal,
  CourageScoreChange,
  Exercise,
  ID,
  OutboxEntry,
  Routine,
  RoutineExercise,
  Session,
  SetLog,
  SyncTable,
} from './types'
import {
  DEFAULT_REP_CEILING,
  DEFAULT_SETTINGS,
  LEGACY_REP_CEILING,
  nowISO,
} from './types'

interface WorkoutDB extends DBSchema {
  exercises: { key: ID; value: Exercise }
  routines: { key: ID; value: Routine }
  routine_exercises: {
    key: ID
    value: RoutineExercise
    indexes: { by_routine: ID; by_exercise: ID }
  }
  sessions: { key: ID; value: Session; indexes: { by_started: string } }
  set_logs: {
    key: ID
    value: SetLog
    indexes: { by_session: ID; by_exercise: ID; by_completed: string }
  }
  body_weight_logs: { key: ID; value: BodyWeightLog; indexes: { by_logged_at: string } }
  courage_goals: { key: ID; value: CourageGoal; indexes: { by_parent: ID } }
  courage_attempts: {
    key: ID
    value: CourageAttempt
    indexes: { by_goal: ID; by_planned: string }
  }
  courage_score_changes: { key: ID; value: CourageScoreChange; indexes: { by_goal: ID } }
  /** Fila de sincronizacao: o que ainda nao subiu para o Supabase. */
  outbox: { key: number; value: OutboxEntry }
  /** Fotos como blob, garantindo imagem no exercicio mesmo offline. */
  photos: { key: string; value: Blob }
  /** Chave/valor solto: treino ativo, marca de sync, preferencias. */
  meta: { key: string; value: unknown }
}

const DB_NAME = 'workout'
const DB_VERSION = 3

let dbPromise: Promise<IDBPDatabase<WorkoutDB>> | null = null

export function db(): Promise<IDBPDatabase<WorkoutDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WorkoutDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore('exercises', { keyPath: 'id' })
          database.createObjectStore('routines', { keyPath: 'id' })

          const re = database.createObjectStore('routine_exercises', { keyPath: 'id' })
          re.createIndex('by_routine', 'routine_id')
          re.createIndex('by_exercise', 'exercise_id')

          const sessions = database.createObjectStore('sessions', { keyPath: 'id' })
          sessions.createIndex('by_started', 'started_at')

          const logs = database.createObjectStore('set_logs', { keyPath: 'id' })
          logs.createIndex('by_session', 'session_id')
          logs.createIndex('by_exercise', 'exercise_id')
          logs.createIndex('by_completed', 'completed_at')

          database.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
          database.createObjectStore('photos')
          database.createObjectStore('meta')
        }

        if (oldVersion < 2) {
          const bw = database.createObjectStore('body_weight_logs', { keyPath: 'id' })
          bw.createIndex('by_logged_at', 'logged_at')
        }

        if (oldVersion < 3) {
          const goals = database.createObjectStore('courage_goals', { keyPath: 'id' })
          goals.createIndex('by_parent', 'parent_id')

          const attempts = database.createObjectStore('courage_attempts', { keyPath: 'id' })
          attempts.createIndex('by_goal', 'goal_id')
          attempts.createIndex('by_planned', 'planned_at')

          const changes = database.createObjectStore('courage_score_changes', { keyPath: 'id' })
          changes.createIndex('by_goal', 'goal_id')
        }
      },
    })
  }
  return dbPromise
}

/* ---------------------------------------------------------------- outbox */

/**
 * Enfileira uma linha para subir. A fila guarda apenas a referencia
 * (tabela + id): na hora do push lemos o estado atual, entao reenfileirar e
 * inofensivo e o envio e naturalmente idempotente.
 */
export async function enqueue(table: SyncTable, row_id: ID, op: 'upsert' | 'delete' = 'upsert') {
  const database = await db()
  await database.add('outbox', { table, row_id, op, queued_at: nowISO() })
}

export async function outboxAll(): Promise<OutboxEntry[]> {
  return (await db()).getAll('outbox')
}

export async function outboxDrop(seqs: number[]) {
  const database = await db()
  const tx = database.transaction('outbox', 'readwrite')
  await Promise.all(seqs.map((seq) => tx.store.delete(seq)))
  await tx.done
}

export async function outboxCount(): Promise<number> {
  return (await db()).count('outbox')
}

/* ------------------------------------------------------------- exercises */

export async function putExercise(ex: Exercise, { sync = true } = {}) {
  const database = await db()
  await database.put('exercises', ex)
  if (sync) await enqueue('exercises', ex.id)
}

export async function getExercise(id: ID): Promise<Exercise | undefined> {
  return (await db()).get('exercises', id)
}

export async function allExercises(includeArchived = false): Promise<Exercise[]> {
  const rows = await (await db()).getAll('exercises')
  return rows
    .filter((e) => includeArchived || !e.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/* -------------------------------------------------------------- routines */

export async function putRoutine(r: Routine, { sync = true } = {}) {
  const database = await db()
  await database.put('routines', r)
  if (sync) await enqueue('routines', r.id)
}

export async function getRoutine(id: ID): Promise<Routine | undefined> {
  return (await db()).get('routines', id)
}

export async function allRoutines(includeArchived = false): Promise<Routine[]> {
  const rows = await (await db()).getAll('routines')
  return (
    rows
      .filter((r) => includeArchived || !r.archived)
      // Treinos criados antes da agenda nao tem `scheduled_days`; sem este
      // default toda leitura precisaria checar undefined.
      .map((r) => ({ ...r, scheduled_days: r.scheduled_days ?? [] }))
      .sort((a, b) => a.position - b.position)
  )
}

export async function putRoutineExercise(re: RoutineExercise, { sync = true } = {}) {
  const database = await db()
  await database.put('routine_exercises', re)
  if (sync) await enqueue('routine_exercises', re.id)
}

export async function deleteRoutineExercise(id: ID) {
  const database = await db()
  await database.delete('routine_exercises', id)
  await enqueue('routine_exercises', id, 'delete')
}

export async function routineExercises(routine_id: ID): Promise<RoutineExercise[]> {
  const rows = await (await db()).getAllFromIndex('routine_exercises', 'by_routine', routine_id)
  return rows.sort((a, b) => a.position - b.position)
}

export async function allRoutineExercises(): Promise<RoutineExercise[]> {
  return (await db()).getAll('routine_exercises')
}

/* --------------------------------------------------------- sessions/sets */

export async function putSession(s: Session, { sync = true } = {}) {
  const database = await db()
  await database.put('sessions', s)
  if (sync) await enqueue('sessions', s.id)
}

export async function getSession(id: ID): Promise<Session | undefined> {
  return (await db()).get('sessions', id)
}

export async function allSessions(): Promise<Session[]> {
  const rows = await (await db()).getAll('sessions')
  return rows.sort((a, b) => b.started_at.localeCompare(a.started_at))
}

export async function putSetLog(log: SetLog, { sync = true } = {}) {
  const database = await db()
  await database.put('set_logs', log)
  if (sync) await enqueue('set_logs', log.id)
}

export async function deleteSetLog(id: ID) {
  const database = await db()
  await database.delete('set_logs', id)
  await enqueue('set_logs', id, 'delete')
}

export async function allSetLogs(): Promise<SetLog[]> {
  return (await db()).getAll('set_logs')
}

export async function setLogsOfSession(session_id: ID): Promise<SetLog[]> {
  const rows = await (await db()).getAllFromIndex('set_logs', 'by_session', session_id)
  return rows.sort((a, b) => a.completed_at.localeCompare(b.completed_at))
}

export async function setLogsOfExercise(exercise_id: ID): Promise<SetLog[]> {
  const rows = await (await db()).getAllFromIndex('set_logs', 'by_exercise', exercise_id)
  return rows.sort((a, b) => a.completed_at.localeCompare(b.completed_at))
}

/* -------------------------------------------------------- peso corporal */

export async function putBodyWeightLog(log: BodyWeightLog, { sync = true } = {}) {
  const database = await db()
  await database.put('body_weight_logs', log)
  if (sync) await enqueue('body_weight_logs', log.id)
}

export async function allBodyWeightLogs(): Promise<BodyWeightLog[]> {
  const rows = await (await db()).getAll('body_weight_logs')
  return rows.sort((a, b) => a.logged_at.localeCompare(b.logged_at))
}

/* -------------------------------------------------------------- coragem */

export async function putCourageGoal(goal: CourageGoal, { sync = true } = {}) {
  const database = await db()
  await database.put('courage_goals', goal)
  if (sync) await enqueue('courage_goals', goal.id)
}

export async function allCourageGoals(includeArchived = false): Promise<CourageGoal[]> {
  const rows = await (await db()).getAll('courage_goals')
  return rows
    .filter((g) => includeArchived || !g.archived)
    .sort((a, b) => a.score - b.score || a.position - b.position)
}

/**
 * Arquiva em vez de apagar: o historico de tentativas continua valendo para as
 * medias gerais, e nada se perde se voce se arrepender.
 */
export async function archiveCourageGoal(id: ID) {
  const database = await db()
  const goal = await database.get('courage_goals', id)
  if (!goal) return
  await putCourageGoal({ ...goal, archived: true, updated_at: nowISO() })
}

export async function putCourageAttempt(attempt: CourageAttempt, { sync = true } = {}) {
  const database = await db()
  await database.put('courage_attempts', attempt)
  if (sync) await enqueue('courage_attempts', attempt.id)
}

export async function deleteCourageAttempt(id: ID) {
  const database = await db()
  await database.delete('courage_attempts', id)
  await enqueue('courage_attempts', id, 'delete')
}

export async function allCourageAttempts(): Promise<CourageAttempt[]> {
  const rows = await (await db()).getAll('courage_attempts')
  return rows.sort((a, b) => a.planned_at.localeCompare(b.planned_at))
}

export async function putCourageScoreChange(change: CourageScoreChange, { sync = true } = {}) {
  const database = await db()
  await database.put('courage_score_changes', change)
  if (sync) await enqueue('courage_score_changes', change.id)
}

export async function allCourageScoreChanges(): Promise<CourageScoreChange[]> {
  const rows = await (await db()).getAll('courage_score_changes')
  return rows.sort((a, b) => a.changed_at.localeCompare(b.changed_at))
}

/* ----------------------------------------------------------------- meta */

export async function metaGet<T>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key) as Promise<T | undefined>
}

export async function metaSet(key: string, value: unknown) {
  await (await db()).put('meta', value, key)
}

export async function metaDelete(key: string) {
  await (await db()).delete('meta', key)
}

export const SETTINGS_KEY = 'settings'

export async function getSettings(): Promise<AppSettings> {
  const stored = await metaGet<Partial<AppSettings>>(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

export async function putSettings(settings: AppSettings) {
  await metaSet(SETTINGS_KEY, settings)
}

export const ACTIVE_WORKOUT_KEY = 'active_workout'

export async function getActiveWorkout(): Promise<ActiveWorkout | undefined> {
  const workout = await metaGet<ActiveWorkout>(ACTIVE_WORKOUT_KEY)
  // Treino iniciado antes de existir o adiamento nao tem a lista: sem este
  // default, voltar ao app no meio da sessao quebraria a tela.
  return workout ? { ...workout, postponed: workout.postponed ?? [] } : undefined
}

export async function setActiveWorkout(w: ActiveWorkout | null) {
  if (w) await metaSet(ACTIVE_WORKOUT_KEY, w)
  else await metaDelete(ACTIVE_WORKOUT_KEY)
}

/* ----------------------------------------------------------- migracoes */

const CEILING_MIGRATION_KEY = 'migrated:rep_ceiling_12'

/**
 * Migracoes de dados que ja estao no aparelho — o schema do IndexedDB nao
 * resolve estas, porque mudam valores e nao a estrutura.
 *
 * Roda uma vez so (marca em `meta`) e e segura para repetir: cada passo checa
 * o proprio estado antes de escrever.
 */
export async function runDataMigrations(): Promise<number> {
  let changed = 0

  // O teto de repeticoes padrao caiu de 15 para 12. Exercicios que ficaram no
  // valor antigo acompanham; quem escolheu um teto proprio nao e tocado, entao
  // a comparacao e com o valor legado exato, nao com "maior que 12".
  if (!(await metaGet<boolean>(CEILING_MIGRATION_KEY))) {
    const database = await db()
    for (const exercise of await database.getAll('exercises')) {
      if (exercise.rep_ceiling !== LEGACY_REP_CEILING) continue
      await putExercise(
        { ...exercise, rep_ceiling: DEFAULT_REP_CEILING, updated_at: nowISO() },
      )
      changed++
    }
    await metaSet(CEILING_MIGRATION_KEY, true)
  }

  return changed
}

/* --------------------------------------------------------------- photos */

export async function putPhotoBlob(key: string, blob: Blob) {
  await (await db()).put('photos', blob, key)
}

export async function getPhotoBlob(key: string): Promise<Blob | undefined> {
  return (await db()).get('photos', key)
}

export async function deletePhotoBlob(key: string) {
  await (await db()).delete('photos', key)
}

/* -------------------------------------------------------- backup (JSON) */

export interface Backup {
  version: 1 | 2
  exported_at: string
  /** Presente a partir da versao 2: dias de descanso e demais preferencias. */
  settings?: AppSettings
  exercises: Exercise[]
  routines: Routine[]
  routine_exercises: RoutineExercise[]
  sessions: Session[]
  set_logs: SetLog[]
  body_weight_logs: BodyWeightLog[]
  courage_goals?: CourageGoal[]
  courage_attempts?: CourageAttempt[]
  courage_score_changes?: CourageScoreChange[]
}

export async function exportBackup(): Promise<Backup> {
  const database = await db()
  const settings = await getSettings()
  const [
    exercises,
    routines,
    routine_exercises,
    sessions,
    set_logs,
    body_weight_logs,
    courage_goals,
    courage_attempts,
    courage_score_changes,
  ] = await Promise.all([
    database.getAll('exercises'),
    database.getAll('routines'),
    database.getAll('routine_exercises'),
    database.getAll('sessions'),
    database.getAll('set_logs'),
    database.getAll('body_weight_logs'),
    database.getAll('courage_goals'),
    database.getAll('courage_attempts'),
    database.getAll('courage_score_changes'),
  ])
  return {
    version: 2,
    exported_at: nowISO(),
    settings,
    exercises,
    routines,
    routine_exercises,
    sessions,
    set_logs,
    body_weight_logs,
    courage_goals,
    courage_attempts,
    courage_score_changes,
  }
}

/** Importa um backup mesclando por updated_at, onde o mais recente vence. */
export async function importBackup(backup: Backup): Promise<number> {
  const database = await db()
  let applied = 0

  // Preferencia tambem resolve por updated_at: backup antigo nao apaga ajuste
  // recente feito neste aparelho.
  if (backup.settings) {
    const local = await getSettings()
    if (local.updated_at < backup.settings.updated_at) {
      await putSettings({ ...DEFAULT_SETTINGS, ...backup.settings })
      applied++
    }
  }
  const tables: SyncTable[] = [
    'exercises',
    'routines',
    'routine_exercises',
    'sessions',
    'set_logs',
    'body_weight_logs',
    'courage_goals',
    'courage_attempts',
    'courage_score_changes',
  ]
  for (const table of tables) {
    const rows = (backup[table] ?? []) as Array<{ id: ID; updated_at: string }>
    for (const row of rows) {
      const local = await database.get(table, row.id)
      if (!local || (local as { updated_at: string }).updated_at < row.updated_at) {
        await database.put(table, row as never)
        await enqueue(table, row.id)
        applied++
      }
    }
  }
  return applied
}
