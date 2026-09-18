import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  ActiveWorkout,
  Exercise,
  ID,
  OutboxEntry,
  Routine,
  RoutineExercise,
  Session,
  SetLog,
  SyncTable,
} from './types'
import { nowISO } from './types'

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
  /** Fila de sincronizacao: o que ainda nao subiu para o Supabase. */
  outbox: { key: number; value: OutboxEntry }
  /** Fotos como blob, garantindo imagem no exercicio mesmo offline. */
  photos: { key: string; value: Blob }
  /** Chave/valor solto: treino ativo, marca de sync, preferencias. */
  meta: { key: string; value: unknown }
}

const DB_NAME = 'workout'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<WorkoutDB>> | null = null

export function db(): Promise<IDBPDatabase<WorkoutDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WorkoutDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
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
  return rows
    .filter((r) => includeArchived || !r.archived)
    .sort((a, b) => a.position - b.position)
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

export const ACTIVE_WORKOUT_KEY = 'active_workout'

export async function getActiveWorkout(): Promise<ActiveWorkout | undefined> {
  return metaGet<ActiveWorkout>(ACTIVE_WORKOUT_KEY)
}

export async function setActiveWorkout(w: ActiveWorkout | null) {
  if (w) await metaSet(ACTIVE_WORKOUT_KEY, w)
  else await metaDelete(ACTIVE_WORKOUT_KEY)
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
  version: 1
  exported_at: string
  exercises: Exercise[]
  routines: Routine[]
  routine_exercises: RoutineExercise[]
  sessions: Session[]
  set_logs: SetLog[]
}

export async function exportBackup(): Promise<Backup> {
  const database = await db()
  const [exercises, routines, routine_exercises, sessions, set_logs] = await Promise.all([
    database.getAll('exercises'),
    database.getAll('routines'),
    database.getAll('routine_exercises'),
    database.getAll('sessions'),
    database.getAll('set_logs'),
  ])
  return {
    version: 1,
    exported_at: nowISO(),
    exercises,
    routines,
    routine_exercises,
    sessions,
    set_logs,
  }
}

/** Importa um backup mesclando por updated_at, onde o mais recente vence. */
export async function importBackup(backup: Backup): Promise<number> {
  const database = await db()
  let applied = 0
  const tables: SyncTable[] = ['exercises', 'routines', 'routine_exercises', 'sessions', 'set_logs']
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
