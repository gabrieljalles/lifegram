import { db, getPhotoBlob, metaGet, metaSet, outboxAll, outboxDrop, putPhotoBlob } from './db'
import { PHOTO_BUCKET, SIGNED_URL_TTL, currentUserId, supabase } from './supabase'
import { photoKeyFor } from './photo'
import type { Exercise, ID, SyncTable } from './types'
import { nowISO } from './types'

const TABLES: SyncTable[] = [
  'exercises',
  'routines',
  'routine_exercises',
  'sessions',
  'set_logs',
  'body_weight_logs',
  'courage_goals',
  'courage_attempts',
  'courage_score_changes',
  'courage_rejections',
]

/** routine_exercises herda a dona pela rotina, entao nao carrega user_id. */
const HAS_USER_ID: Record<SyncTable, boolean> = {
  exercises: true,
  routines: true,
  routine_exercises: false,
  sessions: true,
  set_logs: true,
  body_weight_logs: true,
  courage_goals: true,
  courage_attempts: true,
  courage_score_changes: true,
  courage_rejections: true,
}

/** Campos que so existem no cliente e nao devem viajar para o Postgres. */
const LOCAL_ONLY_FIELDS: Partial<Record<SyncTable, string[]>> = {
  exercises: ['photo_local_key'],
}

const lastPulledKey = (table: SyncTable) => `sync:lastPulled:${table}`

export interface SyncResult {
  pushed: number
  pulled: number
  photos: number
  skipped: 'offline' | 'not-configured' | 'no-user' | null
  error?: string
}

let running: Promise<SyncResult> | null = null

/**
 * Sincronizacao completa: sobe a fila local, baixa novidades e resolve fotos.
 *
 * Nunca lanca excecao para a interface — o app e local-first, entao falha de
 * rede e um estado normal, nao um erro que deva interromper o treino.
 */
export function sync(): Promise<SyncResult> {
  if (!running) {
    running = runSync().finally(() => {
      running = null
    })
  }
  return running
}

async function runSync(): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, photos: 0, skipped: null }

  if (!supabase) return { ...result, skipped: 'not-configured' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ...result, skipped: 'offline' }
  }

  const userId = await currentUserId()
  if (!userId) return { ...result, skipped: 'no-user' }

  try {
    result.pushed = await pushOutbox(userId)
    result.pulled = await pullAll(userId)
    result.photos = await syncPhotos(userId)
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  }
  return result
}

/* ------------------------------------------------------------------ push */

async function pushOutbox(userId: string): Promise<number> {
  const entries = await outboxAll()
  if (entries.length === 0) return 0

  const database = await db()
  let pushed = 0

  // Agrupa por tabela e colapsa ids repetidos: so o estado atual da linha sobe.
  for (const table of TABLES) {
    const forTable = entries.filter((e) => e.table === table)
    if (forTable.length === 0) continue

    const deletes = new Set<ID>()
    const upserts = new Set<ID>()
    for (const entry of forTable) {
      if (entry.op === 'delete') {
        deletes.add(entry.row_id)
        upserts.delete(entry.row_id)
      } else {
        upserts.add(entry.row_id)
        deletes.delete(entry.row_id)
      }
    }

    if (deletes.size > 0) {
      const { error } = await supabase!
        .from(table)
        .delete()
        .in('id', [...deletes])
      if (error) throw error
    }

    if (upserts.size > 0) {
      const rows: Record<string, unknown>[] = []
      for (const id of upserts) {
        const local = await database.get(table, id)
        if (!local) continue

        const row = { ...(local as unknown as Record<string, unknown>) }
        if (HAS_USER_ID[table] && !row.user_id) {
          row.user_id = userId
          // Carimba tambem a copia local, para nao reenviar sem dono depois.
          await database.put(table, { ...(local as object), user_id: userId } as never)
        }
        for (const field of LOCAL_ONLY_FIELDS[table] ?? []) delete row[field]
        rows.push(row)
      }

      if (rows.length > 0) {
        const { error } = await supabase!.from(table).upsert(rows, { onConflict: 'id' })
        if (error) throw error
      }
    }

    pushed += forTable.length
  }

  await outboxDrop(entries.map((e) => e.seq as number))
  return pushed
}

/* ------------------------------------------------------------------ pull */

async function pullAll(userId: string): Promise<number> {
  const database = await db()
  let pulled = 0

  for (const table of TABLES) {
    const since = (await metaGet<string>(lastPulledKey(table))) ?? '1970-01-01T00:00:00.000Z'
    const { data, error } = await supabase!
      .from(table)
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(5000)
    if (error) throw error
    if (!data || data.length === 0) continue

    for (const remote of data as Array<Record<string, unknown> & { id: ID; updated_at: string }>) {
      const local = (await database.get(table, remote.id)) as
        (Record<string, unknown> & { updated_at: string }) | undefined

      // Last-write-wins por updated_at. Uso single-user: conflito e raro.
      if (local && local.updated_at >= remote.updated_at) continue

      const merged = { ...remote } as Record<string, unknown>
      // A foto local e melhor que a remota: nao perder o blob offline.
      for (const field of LOCAL_ONLY_FIELDS[table] ?? []) {
        if (local && local[field] != null) merged[field] = local[field]
      }
      await database.put(table, merged as never)
      pulled++
    }

    const newest = (data[data.length - 1] as { updated_at: string }).updated_at
    await metaSet(lastPulledKey(table), newest)
  }

  void userId
  return pulled
}

/* ---------------------------------------------------------------- fotos */

const storagePath = (userId: string, exercise_id: ID) => `${userId}/${exercise_id}.webp`

/**
 * Nos dois sentidos: sobe a foto que so existe neste aparelho e baixa a que
 * so existe na nuvem, para o exercicio nunca aparecer sem imagem.
 */
async function syncPhotos(userId: string): Promise<number> {
  const database = await db()
  const exercises = (await database.getAll('exercises')) as Exercise[]
  let touched = 0

  for (const exercise of exercises) {
    const localKey = exercise.photo_local_key ?? photoKeyFor(exercise.id)
    const blob = await getPhotoBlob(localKey)

    if (blob && !exercise.photo_url) {
      const path = storagePath(userId, exercise.id)
      const { error } = await supabase!.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp' })
      if (error) continue

      const { data } = await supabase!.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL)
      if (!data?.signedUrl) continue

      const updated: Exercise = {
        ...exercise,
        photo_url: data.signedUrl,
        photo_local_key: localKey,
        updated_at: nowISO(),
      }
      await database.put('exercises', updated)
      await database.add('outbox', {
        table: 'exercises',
        row_id: exercise.id,
        op: 'upsert',
        queued_at: nowISO(),
      })
      touched++
      continue
    }

    if (!blob && exercise.photo_url) {
      const path = storagePath(exercise.user_id ?? userId, exercise.id)
      const { data, error } = await supabase!.storage.from(PHOTO_BUCKET).download(path)
      if (error || !data) continue

      await putPhotoBlob(localKey, data)
      await database.put('exercises', { ...exercise, photo_local_key: localKey })
      touched++
    }
  }

  return touched
}

/* ------------------------------------------------------- disparo automatico */

/** Sincroniza ao abrir, ao voltar a ter rede e ao trazer o app para frente. */
export function startAutoSync(onResult?: (result: SyncResult) => void) {
  if (!supabase) return () => {}

  const run = () => {
    void sync().then((result) => onResult?.(result))
  }

  run()
  const interval = window.setInterval(run, 5 * 60 * 1000)
  const onOnline = () => run()
  const onVisible = () => {
    if (document.visibilityState === 'visible') run()
  }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    window.clearInterval(interval)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
