import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  allExercises,
  allRoutineExercises,
  allRoutines,
  allSessions,
  allSetLogs,
  getActiveWorkout,
  outboxCount,
  setActiveWorkout as persistActiveWorkout,
} from './db'
import { isSupabaseConfigured, supabase } from './supabase'
import { startAutoSync, sync, type SyncResult } from './sync'
import type {
  ActiveWorkout,
  Exercise,
  ID,
  Routine,
  RoutineExercise,
  Session,
  SetLog,
} from './types'

export type SyncStatus = 'local' | 'signed-out' | 'synced' | 'pending' | 'offline' | 'error'

interface AppState {
  ready: boolean
  exercises: Exercise[]
  routines: Routine[]
  routineExercises: RoutineExercise[]
  sessions: Session[]
  setLogs: SetLog[]
  active: ActiveWorkout | null
  exerciseById: Map<ID, Exercise>
  logsByExercise: Map<ID, SetLog[]>
  userEmail: string | null
  syncStatus: SyncStatus
  pendingCount: number
  reload: () => Promise<void>
  setActive: (workout: ActiveWorkout | null) => Promise<void>
  syncNow: () => Promise<SyncResult | null>
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineExercises, setRoutineExercises] = useState<RoutineExercise[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [setLogs, setSetLogs] = useState<SetLog[]>([])
  const [active, setActiveState] = useState<ActiveWorkout | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    isSupabaseConfigured ? 'signed-out' : 'local',
  )

  const reload = useCallback(async () => {
    const [ex, rt, rex, ses, logs, act, pending] = await Promise.all([
      allExercises(),
      allRoutines(),
      allRoutineExercises(),
      allSessions(),
      allSetLogs(),
      getActiveWorkout(),
      outboxCount(),
    ])
    setExercises(ex)
    setRoutines(rt)
    setRoutineExercises(rex)
    setSessions(ses)
    setSetLogs(logs)
    setActiveState(act ?? null)
    setPendingCount(pending)
    setReady(true)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Sessao do Supabase (quando configurado).
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
      if (session) void sync().then(() => void reload())
    })
    return () => listener.subscription.unsubscribe()
  }, [reload])

  const applySyncResult = useCallback(
    async (result: SyncResult) => {
      if (result.skipped === 'not-configured') setSyncStatus('local')
      else if (result.skipped === 'no-user') setSyncStatus('signed-out')
      else if (result.skipped === 'offline') setSyncStatus('offline')
      else if (result.error) setSyncStatus('error')
      else setSyncStatus('synced')

      if (result.pulled > 0 || result.photos > 0 || result.pushed > 0) await reload()
      setPendingCount(await outboxCount())
    },
    [reload],
  )

  useEffect(() => {
    return startAutoSync((result) => {
      void applySyncResult(result)
    })
  }, [applySyncResult])

  const setActive = useCallback(async (workout: ActiveWorkout | null) => {
    await persistActiveWorkout(workout)
    setActiveState(workout)
  }, [])

  const syncNow = useCallback(async () => {
    if (!isSupabaseConfigured) return null
    const result = await sync()
    await applySyncResult(result)
    return result
  }, [applySyncResult])

  const exerciseById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  )

  const logsByExercise = useMemo(() => {
    const map = new Map<ID, SetLog[]>()
    for (const log of setLogs) {
      const list = map.get(log.exercise_id)
      if (list) list.push(log)
      else map.set(log.exercise_id, [log])
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.completed_at.localeCompare(b.completed_at))
    }
    return map
  }, [setLogs])

  const value: AppState = {
    ready,
    exercises,
    routines,
    routineExercises,
    sessions,
    setLogs,
    active,
    exerciseById,
    logsByExercise,
    userEmail,
    syncStatus: pendingCount > 0 && syncStatus === 'synced' ? 'pending' : syncStatus,
    pendingCount,
    reload,
    setActive,
    syncNow,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp precisa estar dentro de AppProvider')
  return ctx
}
