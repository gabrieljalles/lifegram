import {
  deleteSetLog,
  getSession,
  putSession,
  putSetLog,
  routineExercises as routineExercisesOf,
  setActiveWorkout,
  setLogsOfExercise,
  setLogsOfSession,
  getExercise,
  putExercise,
  putRoutine,
  putRoutineExercise,
} from './db'
import { checkPR, totalVolume } from './stats'
import { currentUserId } from './supabase'
import type {
  ActiveItem,
  ActiveWorkout,
  Exercise,
  ID,
  Routine,
  SetLog,
  Session,
  Weekday,
} from './types'
import {
  DEFAULT_REP_CEILING,
  DEFAULT_REP_FLOOR,
  DEFAULT_REST_SECONDS,
  DEFAULT_WEIGHT_INCREMENT,
  newId,
  nowISO,
} from './types'

/* ------------------------------------------------------------- comecar */

/**
 * Abre a sessao e monta a fila de exercicios ja resolvida (alvos e descanso),
 * para que a tela de treino nao precise consultar nada durante a execucao.
 */
export async function startWorkout(routine: Routine): Promise<ActiveWorkout> {
  const planned = await routineExercisesOf(routine.id)
  const items: ActiveItem[] = []

  for (const entry of planned) {
    const exercise = await getExercise(entry.exercise_id)
    if (!exercise || exercise.archived) continue
    items.push({
      exercise_id: entry.exercise_id,
      target_sets: Math.max(1, entry.target_sets),
      target_reps: Math.max(1, entry.target_reps),
      target_weight: entry.target_weight,
      rest_seconds: entry.rest_seconds ?? exercise.default_rest_seconds ?? DEFAULT_REST_SECONDS,
    })
  }

  if (items.length === 0) throw new Error('Este treino nao tem exercicios ativos.')

  const started_at = nowISO()
  const session: Session = {
    id: newId(),
    user_id: await currentUserId(),
    routine_id: routine.id,
    routine_name: routine.name,
    started_at,
    finished_at: null,
    total_volume: 0,
    duration_seconds: 0,
    updated_at: started_at,
  }
  await putSession(session)

  const workout: ActiveWorkout = {
    session_id: session.id,
    routine_id: routine.id,
    routine_name: routine.name,
    started_at,
    cursor: 0,
    set_number: 1,
    items,
    rest_ends_at: null,
    rest_total_seconds: items[0].rest_seconds,
    rest_started_at: null,
    pending_rest_seconds: 0,
    postponed: [],
  }
  await setActiveWorkout(workout)
  return workout
}

/* --------------------------------------------------------- registrar serie */

export interface CompletedSet {
  workout: ActiveWorkout
  log: SetLog
  /** true quando a serie registrada encerrou o treino inteiro. */
  finished: boolean
  isPR: boolean
}

/**
 * Grava a serie concluida e avanca o cursor.
 *
 * A gravacao acontece ANTES de qualquer navegacao ou animacao: se o app fechar
 * no segundo seguinte, a serie ja esta no banco local.
 */
export async function completeSet(
  active: ActiveWorkout,
  input: { weight: number; reps: number },
): Promise<CompletedSet> {
  const item = active.items[active.cursor]
  const completed_at = nowISO()

  const history = await setLogsOfExercise(item.exercise_id)
  const pr = checkPR(input, history)

  const log: SetLog = {
    id: newId(),
    session_id: active.session_id,
    user_id: await currentUserId(),
    exercise_id: item.exercise_id,
    set_number: active.set_number,
    reps: input.reps,
    weight: input.weight,
    completed_at,
    // Descanso real medido antes desta serie (0 na primeira do treino).
    rest_taken_seconds: Math.round(active.pending_rest_seconds),
    is_pr_weight: pr.is_pr_weight,
    is_pr_volume: pr.is_pr_volume,
    updated_at: completed_at,
  }
  await putSetLog(log)

  const wasLastSet = active.set_number >= item.target_sets
  const wasLastExercise = active.cursor >= active.items.length - 1
  const finished = wasLastSet && wasLastExercise

  const nextCursor = wasLastSet ? active.cursor + 1 : active.cursor

  // A carga usada vira o alvo das proximas series deste exercicio na sessao:
  // quem trocou a anilha nao quer redigitar o mesmo numero a cada serie.
  const items = active.items.map((entry, index) =>
    index === active.cursor
      ? { ...entry, target_weight: input.weight, target_reps: input.reps }
      : entry,
  )
  const nextItem = items[Math.min(nextCursor, items.length - 1)]

  const workout: ActiveWorkout = {
    ...active,
    items,
    cursor: finished ? active.cursor : nextCursor,
    set_number: wasLastSet ? 1 : active.set_number + 1,
    // Sem descanso depois da ultima serie do treino: vai direto para o resumo.
    rest_ends_at: finished ? null : Date.now() + nextItem.rest_seconds * 1000,
    rest_total_seconds: nextItem.rest_seconds,
    rest_started_at: finished ? null : Date.now(),
    pending_rest_seconds: 0,
  }

  if (!finished) await setActiveWorkout(workout)

  return { workout, log, finished, isPR: pr.is_pr_weight || pr.is_pr_volume }
}

/**
 * Adia o exercicio atual: ele sai da vez e vai para o fim da fila, sem perder
 * as series ja feitas. O maquinario ocupado, a fila no aparelho ou a vontade
 * de deixar para depois nao deveriam custar o exercicio inteiro.
 *
 * Devolve null quando nao ha para onde adiar (ja e o ultimo da fila).
 */
export async function postponeExercise(active: ActiveWorkout): Promise<ActiveWorkout | null> {
  if (active.cursor >= active.items.length - 1) return null

  const current = active.items[active.cursor]
  const items = [
    ...active.items.slice(0, active.cursor),
    ...active.items.slice(active.cursor + 1),
    current,
  ]

  // O proximo exercicio assume a posicao atual, entao o cursor nao se move —
  // mas a serie precisa considerar o que ja foi feito nele nesta sessao.
  const doneSets = await setLogsOfSession(active.session_id)
  const target = items[active.cursor]
  const already = doneSets.filter((l) => l.exercise_id === target.exercise_id).length

  const workout: ActiveWorkout = {
    ...active,
    items,
    set_number: Math.min(already + 1, target.target_sets),
    rest_ends_at: null,
    rest_total_seconds: target.rest_seconds,
    rest_started_at: null,
    pending_rest_seconds: 0,
    postponed: active.postponed.includes(current.exercise_id)
      ? active.postponed
      : [...active.postponed, current.exercise_id],
  }
  await setActiveWorkout(workout)
  return workout
}

/** Desfaz a ultima serie (erro de digitacao no peso, por exemplo). */
export async function undoSet(active: ActiveWorkout): Promise<ActiveWorkout | null> {
  const logs = await setLogsOfSession(active.session_id)
  const last = logs[logs.length - 1]
  if (!last) return null

  await deleteSetLog(last.id)

  const cursor = active.items.findIndex((i) => i.exercise_id === last.exercise_id)
  const workout: ActiveWorkout = {
    ...active,
    cursor: cursor >= 0 ? cursor : active.cursor,
    set_number: last.set_number,
    rest_ends_at: null,
    rest_started_at: null,
    pending_rest_seconds: 0,
  }
  await setActiveWorkout(workout)
  return workout
}

/* -------------------------------------------------------------- descanso */

/**
 * Encerra o descanso — pulado ou esgotado — e fecha a medicao do tempo real.
 * O valor fica pendente ate a proxima serie, que o grava junto.
 */
export async function skipRest(active: ActiveWorkout): Promise<ActiveWorkout> {
  const measured = active.rest_started_at
    ? Math.max(0, (Date.now() - active.rest_started_at) / 1000)
    : active.pending_rest_seconds

  const workout = {
    ...active,
    rest_ends_at: null,
    rest_started_at: null,
    pending_rest_seconds: measured,
  }
  await setActiveWorkout(workout)
  return workout
}

export async function adjustRest(active: ActiveWorkout, deltaSeconds: number) {
  if (!active.rest_ends_at) return active
  const ends = Math.max(Date.now(), active.rest_ends_at + deltaSeconds * 1000)
  const workout = { ...active, rest_ends_at: ends }
  await setActiveWorkout(workout)
  return workout
}


/**
 * Guarda no treino a carga que voce realmente usou, para a proxima sessao ja
 * abrir no numero certo — voce ajusta uma vez, nao toda semana.
 */
export async function rememberLoad(
  routine_id: ID | null,
  exercise_id: ID,
  weight: number,
  reps: number,
): Promise<void> {
  if (!routine_id) return
  const planned = await routineExercisesOf(routine_id)
  const entry = planned.find((p) => p.exercise_id === exercise_id)
  if (!entry) return
  if (entry.target_weight === weight && entry.target_reps === reps) return

  await putRoutineExercise({
    ...entry,
    target_weight: weight,
    target_reps: reps,
    updated_at: nowISO(),
  })
}

/* -------------------------------------------------------------- terminar */

/** Fecha a sessao consolidando volume e duracao. */
export async function finishWorkout(active: ActiveWorkout): Promise<Session | null> {
  const session = await getSession(active.session_id)
  if (!session) {
    await setActiveWorkout(null)
    return null
  }

  const logs = await setLogsOfSession(active.session_id)
  const finished_at = nowISO()
  const duration = Math.round(
    (new Date(finished_at).getTime() - new Date(session.started_at).getTime()) / 1000,
  )

  const updated: Session = {
    ...session,
    finished_at,
    total_volume: totalVolume(logs),
    duration_seconds: duration,
    updated_at: finished_at,
  }
  await putSession(updated)
  await setActiveWorkout(null)
  return updated
}

/**
 * Sai do treino. Se nenhuma serie foi registrada, a sessao vazia e descartada
 * para nao poluir as estatisticas e o heatmap.
 */
export async function abandonWorkout(active: ActiveWorkout): Promise<Session | null> {
  const logs = await setLogsOfSession(active.session_id)
  if (logs.length === 0) {
    const session = await getSession(active.session_id)
    if (session) {
      // Mantemos a linha, mas sem finished_at ela nao conta em lugar nenhum.
      await putSession({ ...session, finished_at: null, updated_at: nowISO() })
    }
    await setActiveWorkout(null)
    return null
  }
  return finishWorkout(active)
}

/* ---------------------------------------------------- dados de exemplo */

interface SeedExercise {
  name: string
  muscle_group: Exercise['muscle_group']
  sets: number
  reps: number
  weight: number
}

const SEED: Array<{ routine: string; exercises: SeedExercise[] }> = [
  {
    routine: 'Treino A - Peito e Triceps',
    exercises: [
      { name: 'Supino reto com barra', muscle_group: 'peito', sets: 4, reps: 10, weight: 40 },
      {
        name: 'Supino inclinado com halteres',
        muscle_group: 'peito',
        sets: 3,
        reps: 12,
        weight: 16,
      },
      { name: 'Crucifixo na maquina', muscle_group: 'peito', sets: 3, reps: 12, weight: 30 },
      { name: 'Triceps na polia', muscle_group: 'triceps', sets: 4, reps: 12, weight: 25 },
      { name: 'Triceps frances', muscle_group: 'triceps', sets: 3, reps: 12, weight: 14 },
    ],
  },
  {
    routine: 'Treino B - Costas e Biceps',
    exercises: [
      { name: 'Puxada frontal', muscle_group: 'costas', sets: 4, reps: 10, weight: 45 },
      { name: 'Remada curvada', muscle_group: 'costas', sets: 4, reps: 10, weight: 35 },
      { name: 'Remada unilateral', muscle_group: 'costas', sets: 3, reps: 12, weight: 20 },
      { name: 'Rosca direta', muscle_group: 'biceps', sets: 4, reps: 12, weight: 20 },
      { name: 'Rosca martelo', muscle_group: 'biceps', sets: 3, reps: 12, weight: 12 },
    ],
  },
  {
    routine: 'Treino C - Pernas e Ombros',
    exercises: [
      { name: 'Agachamento livre', muscle_group: 'pernas', sets: 4, reps: 10, weight: 50 },
      { name: 'Leg press', muscle_group: 'pernas', sets: 4, reps: 12, weight: 120 },
      { name: 'Cadeira extensora', muscle_group: 'pernas', sets: 3, reps: 15, weight: 40 },
      { name: 'Mesa flexora', muscle_group: 'pernas', sets: 3, reps: 12, weight: 35 },
      {
        name: 'Desenvolvimento com halteres',
        muscle_group: 'ombros',
        sets: 4,
        reps: 10,
        weight: 14,
      },
      { name: 'Elevacao lateral', muscle_group: 'ombros', sets: 3, reps: 15, weight: 8 },
      { name: 'Panturrilha em pe', muscle_group: 'panturrilha', sets: 4, reps: 15, weight: 60 },
    ],
  },
]

/**
 * Cria um ABC classico para o app nao abrir vazio. Tudo editavel depois —
 * a ideia e poder treinar hoje e ajustar as cargas na primeira sessao.
 */
export async function seedStarterData(): Promise<void> {
  const user_id = await currentUserId()
  const updated_at = nowISO()
  let routinePosition = 0

  // Segunda / quarta / sexta: agenda classica de ABC, ja deixando o app com
  // dias marcados desde o primeiro minuto (da para trocar no editor).
  const SEED_DAYS: Weekday[][] = [[1], [3], [5]]

  for (const block of SEED) {
    const routine: Routine = {
      id: newId(),
      user_id,
      name: block.routine,
      position: routinePosition,
      scheduled_days: SEED_DAYS[routinePosition] ?? [],
      archived: false,
      updated_at,
    }
    routinePosition++
    await putRoutine(routine)

    let position = 0
    for (const seed of block.exercises) {
      const exercise: Exercise = {
        id: newId(),
        user_id,
        name: seed.name,
        muscle_group: seed.muscle_group,
        photo_url: null,
        photo_local_key: null,
        default_rest_seconds: DEFAULT_REST_SECONDS,
        rep_floor: DEFAULT_REP_FLOOR,
        rep_ceiling: DEFAULT_REP_CEILING,
        weight_increment: DEFAULT_WEIGHT_INCREMENT,
        notes: null,
        archived: false,
        updated_at,
      }
      await putExercise(exercise)

      await putRoutineExercise({
        id: newId(),
        routine_id: routine.id,
        exercise_id: exercise.id,
        position: position++,
        target_sets: seed.sets,
        target_reps: seed.reps,
        target_weight: seed.weight,
        rest_seconds: null,
        updated_at,
      })
    }
  }
}

export type { ID }
