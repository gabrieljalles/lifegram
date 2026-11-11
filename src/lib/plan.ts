import { format, parseISO } from 'date-fns'
import type { Routine, RoutineGroup, Session, Weekday } from './types'

/**
 * Treinos recomendados para um dia. Cada grupo com o dia marcado entra com o
 * treino dele feito ha mais tempo (rodizio); treino avulso entra pelos
 * proprios dias. Puro, para a tela Hoje e a Academia mostrarem o mesmo.
 */

export interface PlanItem {
  key: string
  group: RoutineGroup | null
  /** Recomendado (ou o que foi feito hoje). null = treino livre sem rotina. */
  routine: Routine | null
  /** Sessao terminada hoje que cumpre este item. */
  session: Session | null
}

type SessionLike = Pick<Session, 'routine_id' | 'started_at' | 'finished_at'>

const dayOf = (iso: string) => format(parseISO(iso), 'yyyy-MM-dd')

/** Ultima vez (started_at) que cada rotina foi terminada. */
export function lastDoneByRoutine(sessions: SessionLike[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const s of sessions) {
    if (!s.finished_at || !s.routine_id) continue
    const current = map.get(s.routine_id)
    if (!current || current < s.started_at) map.set(s.routine_id, s.started_at)
  }
  return map
}

/** Grupo valido do treino: grupo apagado ou inexistente = treino avulso. */
export function groupOf(routine: Routine, groups: RoutineGroup[]): RoutineGroup | null {
  if (!routine.group_id) return null
  return groups.find((g) => g.id === routine.group_id && !g.archived) ?? null
}

/** Treinos do grupo, na ordem do rodizio montada pelo usuario. */
export function membersOf(group: RoutineGroup, routines: Routine[]): Routine[] {
  return routines
    .filter((r) => !r.archived && r.group_id === group.id)
    .sort((a, b) => a.position - b.position)
}

/**
 * Proximo do rodizio: nunca feito primeiro (na ordem), depois o feito ha
 * mais tempo.
 */
export function nextInGroup(members: Routine[], last: Map<string, string>): Routine | null {
  if (members.length === 0) return null
  return [...members].sort((a, b) => {
    const la = last.get(a.id) ?? ''
    const lb = last.get(b.id) ?? ''
    if (la === lb) return a.position - b.position
    return la.localeCompare(lb)
  })[0]
}

export function planForDay(
  routines: Routine[],
  groups: RoutineGroup[],
  sessions: Session[],
  date: Date,
): PlanItem[] {
  const day = format(date, 'yyyy-MM-dd')
  const weekday = date.getDay() as Weekday
  const done = sessions
    .filter((s) => s.finished_at && dayOf(s.started_at) === day)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
  const used = new Set<string>()
  // O rodizio olha so o que veio antes de hoje: o feito hoje nao empurra
  // o grupo para o proximo enquanto o dia nao vira.
  const before = lastDoneByRoutine(sessions.filter((s) => dayOf(s.started_at) < day))
  const items: PlanItem[] = []

  for (const group of [...groups].sort((a, b) => a.position - b.position)) {
    if (group.archived || !group.scheduled_days.includes(weekday)) continue
    const members = membersOf(group, routines)
    if (members.length === 0) continue
    const ids = new Set(members.map((m) => m.id))
    const session = done.find((s) => !used.has(s.id) && s.routine_id && ids.has(s.routine_id))
    if (session) used.add(session.id)
    const routine = session
      ? (members.find((m) => m.id === session.routine_id) ?? null)
      : nextInGroup(members, before)
    items.push({ key: `g:${group.id}`, group, routine, session: session ?? null })
  }

  const loose = routines
    .filter((r) => !r.archived && !groupOf(r, groups) && (r.scheduled_days ?? []).includes(weekday))
    .sort((a, b) => a.position - b.position)
  for (const routine of loose) {
    const session = done.find((s) => !used.has(s.id) && s.routine_id === routine.id)
    if (session) used.add(session.id)
    items.push({ key: `r:${routine.id}`, group: null, routine, session: session ?? null })
  }

  // Treinou algo fora do plano: tambem entra no dia, ja feito.
  for (const session of done) {
    if (used.has(session.id)) continue
    const routine = routines.find((r) => r.id === session.routine_id) ?? null
    items.push({
      key: `s:${session.id}`,
      group: routine ? groupOf(routine, groups) : null,
      routine,
      session,
    })
  }
  return items
}

/** Dias cobrados por um grupo ou treino avulso (para a corrente). */
export function scheduledDaysOf(routines: Routine[], groups: RoutineGroup[]): Weekday[] {
  const days = new Set<Weekday>()
  for (const group of groups) {
    if (group.archived || membersOf(group, routines).length === 0) continue
    for (const d of group.scheduled_days) days.add(d)
  }
  for (const r of routines) {
    if (r.archived || groupOf(r, groups)) continue
    for (const d of r.scheduled_days ?? []) days.add(d)
  }
  return [...days].sort()
}
