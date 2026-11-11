import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Activity, Subtask } from './types'

/**
 * Tarefas: itens com subtarefas e prazo opcional. A de uma vez aparece todo
 * dia ate ser concluida; a recorrente aparece nos dias dela ate o prazo e,
 * passou do prazo sem concluir, todo dia. Puro, para tela e teste.
 */

export const isTask = (activity: Pick<Activity, 'item_type'>) => activity.item_type === 'tarefa'

export const subtasksOf = (activity: Pick<Activity, 'subtasks'>): Subtask[] =>
  activity.subtasks ?? []

export function progressOf(activity: Pick<Activity, 'subtasks'>) {
  const list = subtasksOf(activity)
  return { done: list.filter((s) => s.done).length, total: list.length }
}

/** A tarefa maior so fecha com todas as subtarefas feitas. */
export function canComplete(activity: Pick<Activity, 'subtasks'>): boolean {
  const { done, total } = progressOf(activity)
  return done === total
}

/** Dias ate o prazo: positivo = faltam, 0 = vence hoje, negativo = atraso. */
export function daysToDeadline(activity: Pick<Activity, 'deadline'>, now: Date): number | null {
  if (!activity.deadline) return null
  return differenceInCalendarDays(parseISO(activity.deadline), now)
}

/** "faltam 5 dias", "vence amanhã", "vence hoje", "atrasada há 3 dias". */
export function deadlineLabel(days: number | null): string | null {
  if (days == null) return null
  if (days > 1) return `faltam ${days} dias`
  if (days === 1) return 'vence amanhã'
  if (days === 0) return 'vence hoje'
  const late = -days
  return `atrasada há ${late} ${late === 1 ? 'dia' : 'dias'}`
}

/** Liga ou desliga uma subtarefa; diz se agora todas estao feitas. */
export function toggleSubtask(list: Subtask[], id: string): { list: Subtask[]; allDone: boolean } {
  const next = list.map((s) => (s.id === id ? { ...s, done: !s.done } : s))
  return { list: next, allDone: next.length > 0 && next.every((s) => s.done) }
}
