import { dayKey, logFor } from './activities'
import {
  allActivities,
  allActivityLogs,
  deleteActivityLog,
  putActivity,
  putActivityLog,
} from './db'
import { gcalTokenValid, syncGcal } from './gcal'
import { canComplete, isTask, subtasksOf, toggleSubtask } from './tasks'
import { newId, nowISO, type Activity, type ID } from './types'

/**
 * Acoes da agenda. Grava local primeiro (igual ao resto do app) e, se o
 * Google Agenda estiver conectado neste aparelho, espelha em seguida — sem
 * esperar: o toque nao pode travar por causa da rede.
 */

export type ActivityDraft = Pick<
  Activity,
  'title' | 'icon' | 'kind' | 'days' | 'date' | 'time' | 'duration_minutes' | 'travel_minutes'
> &
  Partial<
    Pick<Activity, 'item_type' | 'dose' | 'deadline' | 'subtasks' | 'completed_at' | 'starts_on'>
  >

function mirror() {
  if (!gcalTokenValid()) return
  void allActivities(true).then(syncGcal)
}

export async function saveActivity(
  rawDraft: ActivityDraft,
  existing?: Activity,
): Promise<Activity> {
  const now = nowISO()
  // Campo ausente no rascunho nao apaga o que a linha ja tinha.
  const draft = Object.fromEntries(
    Object.entries(rawDraft).filter(([, value]) => value !== undefined),
  ) as ActivityDraft
  const activity: Activity = existing
    ? { ...existing, ...draft, updated_at: now }
    : {
        id: newId(),
        user_id: null,
        gcal_event_id: null,
        ...draft,
        starts_on: draft.starts_on ?? dayKey(new Date()),
        archived: false,
        created_at: now,
        updated_at: now,
      }
  // Campos que nao valem para o tipo escolhido saem limpos.
  if (activity.kind === 'recorrente') activity.date = null
  else activity.days = []
  await putActivity(activity)
  mirror()
  return activity
}

export async function archiveActivity(activity: Activity) {
  await putActivity({ ...activity, archived: true, updated_at: nowISO() })
  mirror()
}

/**
 * Conclui ou reabre a tarefa. A de uma vez tambem ganha (ou perde) o feito
 * do dia, para aparecer riscada hoje e sumir amanha.
 */
export async function setTaskCompleted(
  activity: Activity,
  done: boolean,
  day = dayKey(new Date()),
) {
  const now = nowISO()
  await putActivity({ ...activity, completed_at: done ? now : null, updated_at: now })
  if (activity.kind === 'esporadica') {
    const log = logFor(await allActivityLogs(), activity.id, day)
    if (done && !log) {
      await putActivityLog({
        id: newId(),
        user_id: null,
        activity_id: activity.id,
        day,
        done_at: now,
        updated_at: now,
      })
    } else if (!done && log) {
      await deleteActivityLog(log.id)
    }
  }
}

/** Marca uma subtarefa. A ultima feita conclui a tarefa; desmarcar reabre. */
export async function toggleTaskStep(activity: Activity, stepId: ID): Promise<boolean> {
  const { list, allDone } = toggleSubtask(subtasksOf(activity), stepId)
  const next = { ...activity, subtasks: list }
  await putActivity({ ...next, updated_at: nowISO() })
  if (allDone && !activity.completed_at) await setTaskCompleted(next, true)
  else if (!allDone && activity.completed_at) await setTaskCompleted(next, false)
  return allDone
}

/** O toque no item: tarefa de uma vez conclui; o resto marca o dia. */
export async function toggleItem(activity: Activity, day: string): Promise<boolean> {
  if (isTask(activity) && activity.kind === 'esporadica') {
    const done = !activity.completed_at
    // Com subtarefas, a tarefa maior so fecha quando todas estiverem feitas.
    if (done && !canComplete(activity)) return false
    await setTaskCompleted(activity, done, day)
    return done
  }
  return toggleActivity(activity.id, day)
}

/** Marca ou desmarca a atividade no dia. Devolve true se ficou feita. */
export async function toggleActivity(activityId: ID, day: string): Promise<boolean> {
  const existing = logFor(await allActivityLogs(), activityId, day)
  if (existing) {
    await deleteActivityLog(existing.id)
    return false
  }
  const now = nowISO()
  await putActivityLog({
    id: newId(),
    user_id: null,
    activity_id: activityId,
    day,
    done_at: now,
    updated_at: now,
  })
  return true
}
