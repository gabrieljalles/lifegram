import { describe, expect, it } from 'vitest'
import { planForDay, scheduledDaysOf } from './plan'
import { scheduleOf } from './stats'
import type { Routine, RoutineGroup, Session, Weekday } from './types'

const routine = (id: string, position: number, extra: Partial<Routine> = {}): Routine => ({
  id,
  user_id: null,
  name: id,
  position,
  scheduled_days: [],
  group_id: null,
  archived: false,
  updated_at: '',
  ...extra,
})

const group = (id: string, days: Weekday[], position = 0): RoutineGroup => ({
  id,
  user_id: null,
  name: id,
  scheduled_days: days,
  position,
  archived: false,
  updated_at: '',
})

const session = (routine_id: string, started_at: string, finished = true): Session => ({
  id: `${routine_id}-${started_at}`,
  user_id: null,
  routine_id,
  routine_name: routine_id,
  started_at,
  finished_at: finished ? started_at : null,
  total_volume: 0,
  duration_seconds: 1800,
  updated_at: '',
})

const ALL: Weekday[] = [0, 1, 2, 3, 4, 5, 6]
// 11/11/2026 e uma quarta-feira (3).
const WED = new Date(2026, 10, 11, 9, 0)

describe('plano do dia', () => {
  const groups = [group('abdominal', ALL, 0), group('corrida', [3, 6], 1)]
  const routines = [
    routine('abs1', 0, { group_id: 'abdominal' }),
    routine('abs2', 1, { group_id: 'abdominal' }),
    routine('tiro', 2, { group_id: 'corrida' }),
    routine('longao', 3, { group_id: 'corrida' }),
    routine('A', 4, { scheduled_days: [3] }),
    routine('B', 5, { scheduled_days: [4] }),
  ]

  it('recomenda um treino por grupo do dia, mais os avulsos', () => {
    const plan = planForDay(routines, groups, [], WED)
    expect(plan.map((p) => p.routine?.id)).toEqual(['abs1', 'tiro', 'A'])
  })

  it('reveza: recomenda o feito ha mais tempo', () => {
    const sessions = [
      session('abs1', '2026-11-10T08:00:00'),
      session('tiro', '2026-11-07T08:00:00'),
    ]
    const plan = planForDay(routines, groups, sessions, WED)
    expect(plan.map((p) => p.routine?.id)).toEqual(['abs2', 'longao', 'A'])
  })

  it('treino feito hoje cumpre o grupo e nao pula para o proximo', () => {
    const sessions = [session('abs2', '2026-11-11T07:00:00')]
    const [abs] = planForDay(routines, groups, sessions, WED)
    expect(abs.routine?.id).toBe('abs2')
    expect(abs.session?.routine_id).toBe('abs2')
  })

  it('treino fora do plano aparece feito', () => {
    const plan = planForDay(routines, groups, [session('B', '2026-11-11T18:00:00')], WED)
    expect(plan.at(-1)?.routine?.id).toBe('B')
    expect(plan.at(-1)?.session).not.toBeNull()
  })

  it('treino de grupo ignora os proprios dias e grupo vazio nao cobra', () => {
    const list = [
      routine('C', 0, { group_id: 'corrida', scheduled_days: [1] }),
      routine('A', 1, { scheduled_days: [3] }),
    ]
    const two = [group('corrida', [6]), group('vazio', [2])]
    expect(scheduledDaysOf(list, two)).toEqual([3, 6])
    expect(scheduleOf(list, { rest_days: [6] }, two).dueDays).toEqual([3])
    // Grupo apagado: o treino volta a valer pelos proprios dias.
    expect(scheduledDaysOf(list, [])).toEqual([1, 3])
  })
})
