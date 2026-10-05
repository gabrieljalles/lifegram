import {
  allCourageAttempts,
  allCourageRejections,
  deleteCourageRejection,
  putCourageRejection,
  archiveCourageGoal,
  deleteCourageAttempt,
  putCourageAttempt,
  putCourageGoal,
  putCourageScoreChange,
  putCourageTrackStep,
} from './db'
import { attemptsOfGoal, clampScore, evaluateGoal } from './courage'
import { emptyRow, registerAttempt, skipStep, type Rating } from './tracks'
import { currentUserId } from './supabase'
import {
  newId,
  nowISO,
  type CourageAttempt,
  type CourageGoal,
  type CourageTrackStep,
  type CourageRejection,
  type CouragePeople,
  type CouragePlace,
  type ID,
} from './types'

/**
 * Acoes da escada do medo. Tudo grava primeiro no IndexedDB e entra na fila de
 * sync — igual ao treino, porque registrar uma exposicao nao pode depender de
 * sinal: o momento de anotar e logo depois de encarar, onde quer que voce
 * esteja.
 */

export async function createGoal(input: {
  name: string
  description?: string | null
  score: number
  parent_id?: ID | null
  position?: number
}): Promise<CourageGoal> {
  const now = nowISO()
  const goal: CourageGoal = {
    id: newId(),
    user_id: await currentUserId(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    score: clampScore(input.score),
    parent_id: input.parent_id ?? null,
    position: input.position ?? 0,
    normalized_at: null,
    archived: false,
    created_at: now,
    updated_at: now,
  }
  await putCourageGoal(goal)
  return goal
}

export async function updateGoal(
  goal: CourageGoal,
  patch: Partial<Pick<CourageGoal, 'name' | 'description' | 'parent_id' | 'position'>>,
): Promise<void> {
  await putCourageGoal({ ...goal, ...patch, updated_at: nowISO() })
}

export async function archiveGoal(id: ID): Promise<void> {
  await archiveCourageGoal(id)
}

/**
 * Muda a nota oficial e guarda o porque no historico.
 *
 * Esta e a unica porta por onde a nota muda — nenhuma rotina automatica chama
 * isso sozinha. Se a nota nova for 0 e as ultimas tentativas tiverem dado
 * certo, o objetivo ja sai daqui marcado como normalizado.
 */
export async function changeScore(
  goal: CourageGoal,
  to: number,
  reason: string,
): Promise<CourageGoal> {
  const score = clampScore(to)
  const now = nowISO()

  if (score !== goal.score) {
    await putCourageScoreChange({
      id: newId(),
      user_id: goal.user_id ?? (await currentUserId()),
      goal_id: goal.id,
      from_score: goal.score,
      to_score: score,
      reason: reason.trim() || 'reavaliação',
      changed_at: now,
      updated_at: now,
    })
  }

  const attempts = attemptsOfGoal(await allCourageAttempts(), goal.id)
  const evaluation = evaluateGoal({ score }, attempts)
  const normalized_at = evaluation.status === 'normalizado' ? (goal.normalized_at ?? now) : null

  const updated: CourageGoal = { ...goal, score, normalized_at, updated_at: now }
  await putCourageGoal(updated)
  return updated
}

/**
 * Etapa 1: salva a previsao ANTES de encarar. A nota real fica em aberto ate
 * voce voltar e completar — e essa separacao no tempo que impede a previsao de
 * ser "lembrada" ja contaminada pelo resultado.
 */
export async function startAttempt(input: {
  goal_id: ID
  predicted: number
  feared: string
  place?: CouragePlace | null
  people?: CouragePeople | null
  energy?: number | null
}): Promise<CourageAttempt> {
  const now = nowISO()
  const attempt: CourageAttempt = {
    id: newId(),
    user_id: await currentUserId(),
    goal_id: input.goal_id,
    predicted: clampScore(input.predicted),
    actual: null,
    feared: input.feared.trim(),
    happened: '',
    outcome_ok: null,
    place: input.place ?? null,
    people: input.people ?? null,
    energy: input.energy ?? null,
    note: null,
    planned_at: now,
    completed_at: null,
    updated_at: now,
  }
  await putCourageAttempt(attempt)
  return attempt
}

/** Etapa 2: a nota real e o que de fato aconteceu. */
export async function completeAttempt(
  attempt: CourageAttempt,
  input: {
    actual: number
    happened: string
    outcome_ok: boolean
    place?: CouragePlace | null
    people?: CouragePeople | null
    energy?: number | null
    note?: string | null
  },
): Promise<CourageAttempt> {
  const now = nowISO()
  const completed: CourageAttempt = {
    ...attempt,
    actual: clampScore(input.actual),
    happened: input.happened.trim(),
    outcome_ok: input.outcome_ok,
    place: input.place ?? attempt.place,
    people: input.people ?? attempt.people,
    energy: input.energy ?? attempt.energy,
    note: input.note?.trim() || attempt.note,
    completed_at: attempt.completed_at ?? now,
    updated_at: now,
  }
  await putCourageAttempt(completed)
  return completed
}

export async function removeAttempt(id: ID): Promise<void> {
  await deleteCourageAttempt(id)
}

/**
 * Reavalia a marca de "normalizado" depois de uma tentativa nova.
 *
 * Le as tentativas do banco em vez de receber a lista da tela: o estado do
 * React ainda nao tem a tentativa recem-gravada, e decidir com dado velho
 * deixava o selo de normalizado para tras.
 *
 * Nao mexe na nota: so liga ou desliga o selo. Devolve true quando o objetivo
 * ACABOU de normalizar — e o gancho da comemoracao na tela.
 */
export async function refreshNormalized(goal: CourageGoal): Promise<boolean> {
  const evaluation = evaluateGoal(goal, attemptsOfGoal(await allCourageAttempts(), goal.id))
  const shouldBe = evaluation.status === 'normalizado'
  const isNow = goal.normalized_at !== null
  if (shouldBe === isNow) return false

  const now = nowISO()
  await putCourageGoal({
    ...goal,
    normalized_at: shouldBe ? now : null,
    updated_at: now,
  })
  return shouldBe
}

/* ----------------------------------------------------- colecao de naos */

/**
 * Registra um "nao" tomado. Um toque, sem formulario: o valor do contador
 * vem de ele ser facil de alimentar na hora, ainda na rua.
 */
export async function addRejection(note?: string | null): Promise<CourageRejection> {
  const now = nowISO()
  const rejection: CourageRejection = {
    id: newId(),
    user_id: await currentUserId(),
    note: note?.trim() || null,
    happened_at: now,
    updated_at: now,
  }
  await putCourageRejection(rejection)
  return rejection
}

/** Desfaz o ultimo registro — toque errado nao pode sujar a coleção. */
export async function undoLastRejection(): Promise<void> {
  const all = await allCourageRejections()
  const last = all[all.length - 1]
  if (last) await deleteCourageRejection(last.id)
}

/* --------------------------------------------------------------- trilha */

/**
 * Registra uma tentativa num degrau do mapa.
 *
 * A linha nasce no primeiro toque — degrau que voce nunca encostou nao ocupa
 * espaco no banco. Devolve a linha nova e se o degrau ACABOU de fechar, que e
 * o gancho da comemoracao na tela.
 */
export async function registerTrackAttempt(
  rows: CourageTrackStep[],
  track_id: string,
  step_id: string,
  rating: Rating,
  base: number,
): Promise<{ row: CourageTrackStep; justCompleted: boolean }> {
  const existing = rows.find((r) => r.track_id === track_id && r.step_id === step_id)
  const before = existing ?? emptyRow(newId(), await currentUserId(), track_id, step_id)
  const row = registerAttempt(before, rating, base)
  await putCourageTrackStep(row)
  return { row, justCompleted: Boolean(row.completed_at) && !before.completed_at }
}

/**
 * Passou no teste de nivelamento: fecha como dominados os niveis abertos do
 * capitulo (menos os `keep`). Devolve quantos fecharam.
 */
export async function masterSteps(
  rows: CourageTrackStep[],
  track_id: string,
  step_ids: string[],
): Promise<number> {
  for (const step_id of step_ids) await skipTrackStep(rows, track_id, step_id)
  return step_ids.length
}

/** "Isso ja e normal para mim": fecha o degrau sem contar como treinado. */
export async function skipTrackStep(
  rows: CourageTrackStep[],
  track_id: string,
  step_id: string,
): Promise<CourageTrackStep> {
  const existing = rows.find((r) => r.track_id === track_id && r.step_id === step_id)
  const base = existing ?? emptyRow(newId(), await currentUserId(), track_id, step_id)
  const row = skipStep(base)
  await putCourageTrackStep(row)
  return row
}
