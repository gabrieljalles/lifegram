import { dayKey, logFor } from './activities'
import { allActivities, allActivityLogs, deleteActivityLog, putActivity, putActivityLog } from './db'
import { gcalTokenValid, syncGcal } from './gcal'
import { newId, nowISO, type Activity, type ID } from './types'

/**
 * Acoes da agenda. Grava local primeiro (igual ao resto do app) e, se o
 * Google Agenda estiver conectado neste aparelho, espelha em seguida — sem
 * esperar: o toque nao pode travar por causa da rede.
 */

export type ActivityDraft = Pick<
  Activity,
  'title' | 'icon' | 'kind' | 'days' | 'date' | 'time' | 'duration_minutes' | 'travel_minutes'
>

function mirror() {
  if (!gcalTokenValid()) return
  void allActivities(true).then(syncGcal)
}

export async function saveActivity(draft: ActivityDraft, existing?: Activity): Promise<Activity> {
  const now = nowISO()
  const activity: Activity = existing
    ? { ...existing, ...draft, updated_at: now }
    : {
        id: newId(),
        user_id: null,
        ...draft,
        starts_on: dayKey(new Date()),
        gcal_event_id: null,
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
