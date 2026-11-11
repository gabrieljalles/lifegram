import { describe, expect, it } from 'vitest'
import { agendaOf, occursOn } from './activities'
import { canComplete, daysToDeadline, deadlineLabel, toggleSubtask } from './tasks'
import type { Activity } from './types'

const task = (extra: Partial<Activity> = {}): Activity => ({
  id: 't1',
  user_id: null,
  title: 'Montar portfólio',
  icon: '🎯',
  kind: 'esporadica',
  days: [],
  date: null,
  time: null,
  duration_minutes: 30,
  starts_on: '2026-11-10',
  gcal_event_id: null,
  archived: false,
  item_type: 'tarefa',
  subtasks: [],
  deadline: null,
  completed_at: null,
  created_at: '',
  updated_at: '',
  ...extra,
})

const day = (iso: string) => new Date(`${iso}T12:00:00`)

describe('tarefas', () => {
  it('de uma vez aparece todo dia desde o começo até concluir', () => {
    const t = task()
    expect(occursOn(t, day('2026-11-09'))).toBe(false)
    expect(occursOn(t, day('2026-11-10'))).toBe(true)
    expect(occursOn(t, day('2026-12-25'))).toBe(true)
    const done = task({ completed_at: '2026-11-12T15:00:00' })
    expect(occursOn(done, day('2026-11-12'))).toBe(true)
    expect(occursOn(done, day('2026-11-13'))).toBe(false)
  })

  it('recorrente segue os dias até o prazo e depois cobra todo dia', () => {
    // 2026-11-11 e quarta (3); prazo na sexta 13.
    const t = task({ kind: 'recorrente', days: [1, 3], deadline: '2026-11-13' })
    expect(occursOn(t, day('2026-11-11'))).toBe(true)
    expect(occursOn(t, day('2026-11-12'))).toBe(false)
    expect(occursOn(t, day('2026-11-14'))).toBe(true)
  })

  it('fica atrasada só depois do prazo', () => {
    const t = task({ deadline: '2026-11-11' })
    const now = day('2026-11-12')
    expect(agendaOf([t], [], day('2026-11-11'), now)[0].late).toBe(false)
    expect(agendaOf([t], [], day('2026-11-12'), now)[0].late).toBe(true)
  })

  it('conta os dias do prazo', () => {
    const now = day('2026-11-11')
    expect(deadlineLabel(daysToDeadline({ deadline: '2026-11-16' }, now))).toBe('faltam 5 dias')
    expect(deadlineLabel(daysToDeadline({ deadline: '2026-11-12' }, now))).toBe('vence amanhã')
    expect(deadlineLabel(daysToDeadline({ deadline: '2026-11-11' }, now))).toBe('vence hoje')
    expect(deadlineLabel(daysToDeadline({ deadline: '2026-11-10' }, now))).toBe('atrasada há 1 dia')
    expect(deadlineLabel(daysToDeadline({ deadline: null }, now))).toBeNull()
  })

  it('só fecha com todas as subtarefas feitas', () => {
    const list = [
      { id: 'a', title: 'a', done: true },
      { id: 'b', title: 'b', done: false },
    ]
    expect(canComplete({ subtasks: list })).toBe(false)
    expect(canComplete({ subtasks: [] })).toBe(true)
    const { list: next, allDone } = toggleSubtask(list, 'b')
    expect(allDone).toBe(true)
    expect(canComplete({ subtasks: next })).toBe(true)
  })
})
