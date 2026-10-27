import { describe, expect, it } from 'vitest'
import { toEvent } from './gcal'
import { pendingReminders, reminderPlan, reminderText } from './reminders'
import type { Activity, ActivityLog } from './types'

const base: Activity = {
  id: 'dentista',
  user_id: null,
  title: 'Dentista',
  icon: '🦷',
  kind: 'esporadica',
  days: [],
  date: '2026-10-19',
  time: '14:00',
  duration_minutes: 60,
  travel_minutes: 20,
  starts_on: '2026-10-01',
  gcal_event_id: null,
  archived: false,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
}

const act = (patch: Partial<Activity>): Activity => ({ ...base, ...patch })
const day = new Date('2026-10-19T00:00:00')
const hhmm = (date: Date | null) =>
  date ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : null

describe('reminderPlan', () => {
  it('avisa 5 min antes da hora de sair', () => {
    const plan = reminderPlan(base, day)!
    expect([hhmm(plan.notifyAt), hhmm(plan.leaveAt), hhmm(plan.startAt)]).toEqual([
      '13:35',
      '13:40',
      '14:00',
    ])
  })

  it('sem deslocamento: 5 min antes de começar, sem hora de sair', () => {
    const plan = reminderPlan(act({ travel_minutes: 0 }), day)!
    expect(hhmm(plan.notifyAt)).toBe('13:55')
    expect(plan.leaveAt).toBeNull()
  })

  it('linha antiga sem o campo conta como sem deslocamento', () => {
    const { travel_minutes: _, ...old } = base
    expect(hhmm(reminderPlan(old as Activity, day)!.notifyAt)).toBe('13:55')
  })

  it('atividade sem horário não tem aviso', () => {
    expect(reminderPlan(act({ time: null }), day)).toBeNull()
  })
})

describe('reminderText', () => {
  it('título diz o que e quando; corpo lembra de sair', () => {
    const text = reminderText(base, reminderPlan(base, day)!)
    expect(text.title).toBe('🦷 Dentista às 14:00')
    expect(text.body).toBe('Saia em 5 min (às 13:40) — são ~20 min até lá.')
  })
})

describe('pendingReminders', () => {
  const at = (iso: string) => new Date(iso)

  it('inclui o aviso futuro e o atrasado cujo compromisso não começou', () => {
    expect(pendingReminders([base], [], at('2026-10-19T09:00:00'))).toHaveLength(1)
    // 13:50: o aviso (13:35) passou, mas o dentista ainda nao comecou.
    expect(pendingReminders([base], [], at('2026-10-19T13:50:00'))).toHaveLength(1)
    expect(pendingReminders([base], [], at('2026-10-19T14:01:00'))).toHaveLength(0)
  })

  it('pula o que já foi marcado como feito e o arquivado', () => {
    const done: ActivityLog = {
      id: 'l',
      user_id: null,
      activity_id: 'dentista',
      day: '2026-10-19',
      done_at: '',
      updated_at: '',
    }
    expect(pendingReminders([base], [done], at('2026-10-19T09:00:00'))).toHaveLength(0)
    expect(pendingReminders([act({ archived: true })], [], at('2026-10-19T09:00:00'))).toHaveLength(0)
  })

  it('recorrente entra hoje e amanhã, em ordem', () => {
    const corrida = act({ id: 'corrida', kind: 'recorrente', date: null, days: [1, 2], time: '07:00', travel_minutes: 0 })
    const list = pendingReminders([corrida], [], at('2026-10-19T06:00:00'), 48 * 3600 * 1000)
    expect(list.map((r) => r.key.split('|')[1])).toEqual(['2026-10-19', '2026-10-20'])
  })
})

describe('lembrete no Google Agenda', () => {
  it('popup na hora do aviso, só para atividade com horário', () => {
    expect(toEvent(base)!.reminders).toEqual({
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 25 }],
    })
    expect(toEvent(act({ time: null }))!.reminders).toBeUndefined()
  })
})
