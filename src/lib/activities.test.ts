import { describe, expect, it } from 'vitest'
import {
  activityXP,
  agendaOf,
  describeDays,
  nextOccurrence,
  relativeLabel,
  streakOf,
} from './activities'
import { firstDay, fromGoogle, rruleOf, templateUrl, toEvent } from './gcal'
import type { Activity, ActivityLog } from './types'

const base: Activity = {
  id: 'ler',
  user_id: null,
  title: 'Ler uma página',
  icon: '📖',
  kind: 'recorrente',
  days: [1, 2, 3, 4, 5],
  date: null,
  time: null,
  duration_minutes: 30,
  starts_on: '2026-10-01',
  gcal_event_id: null,
  archived: false,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
}

const act = (patch: Partial<Activity>): Activity => ({ ...base, ...patch })
const log = (activity_id: string, day: string): ActivityLog => ({
  id: `${activity_id}-${day}`,
  user_id: null,
  activity_id,
  day,
  done_at: `${day}T12:00:00.000Z`,
  updated_at: `${day}T12:00:00.000Z`,
})

// Segunda, 19/10/2026, 10h da manha.
const monday = new Date(2026, 9, 19, 10, 0)

describe('agenda do dia', () => {
  it('recorrente aparece so nos dias marcados', () => {
    expect(agendaOf([base], [], monday, monday)).toHaveLength(1)
    expect(agendaOf([base], [], new Date(2026, 9, 18), monday)).toHaveLength(0) // domingo
  })

  it('nao cobra antes de existir nem quando arquivada', () => {
    expect(agendaOf([act({ starts_on: '2026-10-20' })], [], monday, monday)).toHaveLength(0)
    expect(agendaOf([act({ archived: true })], [], monday, monday)).toHaveLength(0)
  })

  it('esporadica aparece so na data', () => {
    const dentista = act({ id: 'd', kind: 'esporadica', days: [], date: '2026-10-21' })
    expect(agendaOf([dentista], [], monday, monday)).toHaveLength(0)
    expect(agendaOf([dentista], [], new Date(2026, 9, 21), monday)).toHaveLength(1)
  })

  it('ordena por horario, sem hora no fim, e marca atrasada', () => {
    const cedo = act({ id: 'cedo', time: '07:00' })
    const tarde = act({ id: 'tarde', time: '18:00' })
    const livre = act({ id: 'livre' })
    const list = agendaOf([livre, tarde, cedo], [], monday, monday)
    expect(list.map((o) => o.activity.id)).toEqual(['cedo', 'tarde', 'livre'])
    expect(list.map((o) => o.late)).toEqual([true, false, false])
  })
})

describe('proxima atividade', () => {
  it('pega a primeira em aberto de hoje', () => {
    const cedo = act({ id: 'cedo', time: '07:00' })
    const tarde = act({ id: 'tarde', time: '18:00' })
    expect(nextOccurrence([cedo, tarde], [log('cedo', '2026-10-19')], monday)?.activity.id).toBe(
      'tarde',
    )
  })

  it('com hoje fechado, pula para o proximo dia marcado', () => {
    const sabado = act({ id: 'sab', days: [6], time: '09:00' })
    const next = nextOccurrence([sabado], [], monday)
    expect(next?.day).toBe('2026-10-24')
    expect(relativeLabel(next!, monday)).toBe('24/10 às 09:00')
  })

  it('rotulos relativos de hoje', () => {
    const occ = agendaOf([act({ time: '10:25' })], [], monday, monday)[0]
    expect(relativeLabel(occ, monday)).toBe('em 25 min')
    const amanha = nextOccurrence([act({ time: '07:00' })], [log('ler', '2026-10-19')], monday)
    expect(relativeLabel(amanha!, monday)).toBe('amanhã às 07:00')
  })
})

describe('corrente e XP', () => {
  it('conta ocorrencias seguidas e pula dias sem cobranca', () => {
    // seg 12 a sex 16 feitas; fim de semana nao conta; hoje (seg 19) ainda aberto.
    const logs = ['12', '13', '14', '15', '16'].map((d) => log('ler', `2026-10-${d}`))
    expect(streakOf(base, logs, monday)).toBe(5)
    expect(streakOf(base, [...logs, log('ler', '2026-10-19')], monday)).toBe(6)
  })

  it('falta quebra a corrente', () => {
    const logs = ['12', '13', '15', '16'].map((d) => log('ler', `2026-10-${d}`))
    expect(streakOf(base, logs, monday)).toBe(2)
  })

  it('combo dobra o XP a partir de 7 seguidas', () => {
    const todo = act({ days: [0, 1, 2, 3, 4, 5, 6] })
    const logs = Array.from({ length: 8 }, (_, i) => log('ler', `2026-10-${String(12 + i)}`))
    // 6 primeiras valem 20, a 7a e a 8a valem 40.
    expect(activityXP([todo], logs, monday)).toEqual({ total: 6 * 20 + 2 * 40, today: 40 })
  })

  it('esporadica vale 40 e arquivar nao apaga o XP', () => {
    const dentista = act({ id: 'd', kind: 'esporadica', days: [], date: '2026-10-19', archived: true })
    expect(activityXP([dentista], [log('d', '2026-10-19')], monday)).toEqual({ total: 40, today: 40 })
  })
})

describe('textos', () => {
  it('descreve os dias', () => {
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Seg a sex')
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe('Todo dia')
    expect(describeDays([1, 3, 5])).toBe('Seg, qua, sex')
  })
})

describe('Google Agenda', () => {
  it('recorrente vira evento semanal comecando no primeiro dia valido', () => {
    // 01/10/2026 e quinta.
    const event = toEvent(act({ days: [1, 3], time: '07:00', duration_minutes: 45 }))!
    expect(firstDay(act({ days: [1, 3] }))).toBe('2026-10-05')
    expect(event.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'])
    expect(event.start).toMatchObject({ dateTime: '2026-10-05T07:00:00' })
    expect(event.end).toMatchObject({ dateTime: '2026-10-05T07:45:00' })
  })

  it('sem horario vira evento de dia inteiro', () => {
    const event = toEvent(act({ kind: 'esporadica', days: [], date: '2026-10-21' }))!
    expect(event.start).toEqual({ date: '2026-10-21' })
    expect(event.end).toEqual({ date: '2026-10-22' })
    expect('recurrence' in event).toBe(false)
  })

  it('link de modelo leva a repeticao', () => {
    const url = new URL(templateUrl(act({ time: '07:00' }))!)
    expect(url.searchParams.get('recur')).toBe(rruleOf(base))
    expect(url.searchParams.get('dates')).toBe('20261001T070000/20261001T073000')
  })
})

describe('eventos lidos do Google', () => {
  it('ignora o que o app criou, abre o dia inteiro em cada dia e ordena', () => {
    const events = fromGoogle([
      { id: 'meu', summary: 'Ler', start: { dateTime: '2026-10-20T07:00:00-03:00' }, extendedProperties: { private: { lifegram_id: 'ler' } } },
      { id: 'cancelado', status: 'cancelled', start: { dateTime: '2026-10-20T08:00:00-03:00' } },
      { id: 'viagem', summary: 'Viagem', start: { date: '2026-10-20' }, end: { date: '2026-10-22' } },
      { id: 'dentista', summary: 'Dentista', start: { dateTime: new Date(2026, 9, 20, 14, 30).toISOString() }, end: { dateTime: new Date(2026, 9, 20, 15, 0).toISOString() } },
    ])
    expect(events.map((e) => [e.day, e.time, e.title])).toEqual([
      ['2026-10-20', null, 'Viagem'],
      ['2026-10-20', '14:30', 'Dentista'],
      ['2026-10-21', null, 'Viagem'],
    ])
    expect(events[1].end).toBe('15:00')
  })
})
