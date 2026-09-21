import { describe, expect, it } from 'vitest'
import {
  bestSet,
  bucketize,
  checkPR,
  compareSets,
  computeScheduleStreak,
  computeStreak,
  epley1RM,
  routinesForDay,
  scheduleOf,
  formatClock,
  linearTrend,
  parseLocalDate,
  periodDelta,
  setLabel,
  suggestProgression,
  summarizeExercise,
  timeBreakdown,
  totalVolume,
  weekKeyOf,
} from './stats'
import type { Exercise, Routine, Session, SetLog, Weekday } from './types'

const iso = (day: string) => `${day}T10:00:00.000Z`

function log(partial: Partial<SetLog> & { weight: number; reps: number; day: string }): SetLog {
  const { day, ...rest } = partial
  return {
    id: `${day}-${rest.weight}-${rest.reps}-${rest.set_number ?? 1}`,
    session_id: partial.session_id ?? day,
    user_id: null,
    exercise_id: partial.exercise_id ?? 'ex1',
    set_number: 1,
    rest_taken_seconds: 90,
    is_pr_weight: false,
    is_pr_volume: false,
    completed_at: iso(day),
    updated_at: iso(day),
    ...rest,
  } as SetLog
}

function session(day: string, finished = true): Session {
  return {
    id: day,
    user_id: null,
    routine_id: 'r1',
    routine_name: 'Treino A',
    started_at: iso(day),
    finished_at: finished ? iso(day) : null,
    total_volume: 0,
    duration_seconds: 3600,
    updated_at: iso(day),
  }
}

describe('volume e 1RM', () => {
  it('soma reps x peso', () => {
    expect(
      totalVolume([
        { reps: 10, weight: 60 },
        { reps: 8, weight: 70 },
      ]),
    ).toBe(1160)
  })

  it('aplica Epley e preserva a serie de 1 rep', () => {
    expect(epley1RM(100, 1)).toBe(100)
    expect(epley1RM(60, 10)).toBeCloseTo(80, 6)
    expect(epley1RM(0, 10)).toBe(0)
    expect(epley1RM(60, 0)).toBe(0)
  })

  it('aceita carga negativa (maquinas assistidas)', () => {
    expect(epley1RM(-20, 1)).toBe(-20)
    expect(epley1RM(-30, 10)).toBeCloseTo(-40, 6)
  })
})

describe('linearTrend', () => {
  it('recupera uma progressao conhecida de +2kg por mes', () => {
    const points = [
      { date: new Date('2026-01-01'), value: 100 },
      { date: new Date('2026-01-31'), value: 102 },
      { date: new Date('2026-03-02'), value: 104 },
      { date: new Date('2026-04-01'), value: 106 },
    ]
    const trend = linearTrend(points)
    expect(trend.perMonth).toBeCloseTo(2, 1)
    expect(trend.percentPerMonth).toBeCloseTo(2, 1)
    expect(trend.r2).toBeGreaterThan(0.99)
    expect(trend.reliable).toBe(true)
  })

  it('marca como nao confiavel com menos de 3 pontos', () => {
    const trend = linearTrend([
      { date: new Date('2026-01-01'), value: 100 },
      { date: new Date('2026-02-01'), value: 110 },
    ])
    expect(trend.reliable).toBe(false)
  })

  it('nao explode quando todos os pontos caem no mesmo dia', () => {
    const d = new Date('2026-01-01')
    const trend = linearTrend([
      { date: d, value: 100 },
      { date: d, value: 120 },
    ])
    expect(trend.perMonth).toBe(0)
    expect(Number.isFinite(trend.percentPerMonth)).toBe(true)
  })

  it('detecta regressao (perda de carga)', () => {
    const trend = linearTrend([
      { date: new Date('2026-01-01'), value: 100 },
      { date: new Date('2026-01-31'), value: 95 },
      { date: new Date('2026-03-02'), value: 90 },
    ])
    expect(trend.perMonth).toBeLessThan(0)
  })
})

describe('summarizeExercise', () => {
  const logs = [
    log({ day: '2026-01-05', weight: 60, reps: 10, session_id: 's1' }),
    log({ day: '2026-01-05', weight: 60, reps: 8, session_id: 's1', set_number: 2 }),
    log({ day: '2026-02-04', weight: 65, reps: 10, session_id: 's2' }),
    log({ day: '2026-03-06', weight: 70, reps: 10, session_id: 's3' }),
  ]

  it('colapsa series em um ponto por sessao', () => {
    const summary = summarizeExercise(logs, new Date(2026, 2, 16))
    expect(summary.sessions).toBe(3)
    expect(summary.totalSets).toBe(4)
    expect(summary.totalReps).toBe(38)
    expect(summary.points[0].volume).toBe(60 * 10 + 60 * 8)
    expect(summary.points[0].topWeight).toBe(60)
  })

  it('extrai recordes e dias desde a ultima vez', () => {
    const summary = summarizeExercise(logs, new Date(2026, 2, 16))
    expect(summary.prWeight).toBe(70)
    expect(summary.prSetVolume).toBe(700)
    expect(summary.daysSinceLast).toBe(10)
  })

  it('reporta progresso mensal positivo', () => {
    const summary = summarizeExercise(logs, new Date(2026, 2, 16))
    expect(summary.trendTopWeight.perMonth).toBeGreaterThan(4)
    expect(summary.trendTopWeight.reliable).toBe(true)
  })

  it('aguenta historico vazio', () => {
    const summary = summarizeExercise([], new Date(2026, 2, 16))
    expect(summary.sessions).toBe(0)
    expect(summary.prWeight).toBe(0)
    expect(summary.daysSinceLast).toBeNull()
    expect(summary.trendE1RM.reliable).toBe(false)
  })
})

describe('checkPR', () => {
  const history = [
    { weight: 60, reps: 10 },
    { weight: 70, reps: 5 },
  ]

  it('reconhece recorde de carga', () => {
    expect(checkPR({ weight: 72.5, reps: 5 }, history).is_pr_weight).toBe(true)
  })

  it('reconhece recorde de volume sem recorde de carga', () => {
    const check = checkPR({ weight: 65, reps: 12 }, history)
    expect(check.is_pr_weight).toBe(false)
    expect(check.is_pr_volume).toBe(true)
  })

  it('empate nao e recorde', () => {
    const check = checkPR({ weight: 70, reps: 5 }, history)
    expect(check.is_pr_weight).toBe(false)
    expect(check.is_pr_volume).toBe(false)
  })

  it('primeira vez no exercicio conta como recorde', () => {
    const check = checkPR({ weight: 40, reps: 10 }, [])
    expect(check.is_pr_weight).toBe(true)
    expect(check.is_pr_volume).toBe(true)
  })

  it('ignora series sem carga ou sem reps', () => {
    expect(checkPR({ weight: 0, reps: 10 }, []).is_pr_weight).toBe(false)
  })

  it('reconhece recorde com carga negativa (maquina assistida)', () => {
    const assistHistory = [{ weight: -20, reps: 10 }]
    // menos assistencia (-15 > -20) e uma melhora, mesmo negativa
    const check = checkPR({ weight: -15, reps: 10 }, assistHistory)
    expect(check.is_pr_weight).toBe(true)
  })

  it('primeira vez com carga negativa tambem conta como recorde', () => {
    const check = checkPR({ weight: -20, reps: 10 }, [])
    expect(check.is_pr_weight).toBe(true)
    expect(check.is_pr_volume).toBe(true)
  })
})

describe('computeStreak', () => {
  it('nao quebra a corrente em um dia de descanso', () => {
    const sessions = ['2026-03-02', '2026-03-04', '2026-03-06', '2026-03-08'].map((d) => session(d))
    const streak = computeStreak(sessions, new Date('2026-03-09'))
    expect(streak.current).toBe(4)
    expect(streak.longest).toBe(4)
  })

  it('quebra depois de passar da tolerancia', () => {
    const sessions = ['2026-03-01', '2026-03-02', '2026-03-10', '2026-03-11'].map((d) => session(d))
    const streak = computeStreak(sessions, new Date('2026-03-12'))
    expect(streak.current).toBe(2)
    expect(streak.longest).toBe(2)
  })

  it('zera quando faz tempo que nao treina', () => {
    const streak = computeStreak([session('2026-01-01')], new Date('2026-03-01'))
    expect(streak.current).toBe(0)
  })

  it('ignora sessoes abandonadas e dias repetidos', () => {
    const sessions = [session('2026-03-02'), session('2026-03-02'), session('2026-03-03', false)]
    const streak = computeStreak(sessions, new Date('2026-03-03'))
    expect(streak.current).toBe(1)
    expect(streak.days).toHaveLength(1)
  })

  it('sem sessoes devolve zero', () => {
    expect(computeStreak([], new Date('2026-03-03')).current).toBe(0)
  })
})

describe('bucketize', () => {
  const sessions = [session('2026-03-02'), session('2026-03-10')]
  const logs = [
    log({ day: '2026-03-02', weight: 60, reps: 10, session_id: '2026-03-02' }),
    log({ day: '2026-03-10', weight: 70, reps: 10, session_id: '2026-03-10' }),
  ]

  it('agrupa por semana mantendo periodos vazios', () => {
    const buckets = bucketize(sessions, logs, 'week', 4, new Date('2026-03-12'))
    expect(buckets).toHaveLength(4)
    expect(buckets[buckets.length - 1].volume).toBe(700)
    expect(buckets[0].volume).toBe(0)
  })

  it('agrupa por mes somando tudo', () => {
    const buckets = bucketize(sessions, logs, 'month', 3, new Date('2026-03-12'))
    const march = buckets[buckets.length - 1]
    expect(march.volume).toBe(1300)
    expect(march.sessions).toBe(2)
    expect(march.sets).toBe(2)
  })

  it('calcula variacao entre os dois ultimos periodos', () => {
    const buckets = bucketize(sessions, logs, 'week', 4, new Date('2026-03-12'))
    expect(periodDelta(buckets)).toBeCloseTo(((700 - 600) / 600) * 100, 5)
  })
})

describe('formatClock', () => {
  it('mostra o descanso padrao de 1min30', () => {
    expect(formatClock(90)).toBe('1:30')
    expect(formatClock(9)).toBe('0:09')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-5)).toBe('0:00')
  })
})

describe('compareSets', () => {
  it('reconhece ganho de repetição com a mesma carga', () => {
    const c = compareSets({ weight: 45, reps: 12 }, { weight: 45, reps: 10 })
    expect(c.label).toBe('mesma carga, +2 reps')
    expect(c.direction).toBe('up')
    expect(c.repsDelta).toBe(2)
  })

  it('não chama de piora trocar reps por carga quando o 1RM sobe', () => {
    // 45kg x 8 (e1RM 57) contra 44kg x 12 (e1RM 61,6): o volume de reps vence
    const c = compareSets({ weight: 44, reps: 12 }, { weight: 45, reps: 8 })
    expect(c.direction).toBe('up')
    expect(c.label).toBe('-1 kg, +4 reps')
  })

  it('acusa piora quando carga e reps caem', () => {
    const c = compareSets({ weight: 40, reps: 8 }, { weight: 45, reps: 10 })
    expect(c.direction).toBe('down')
    expect(c.label).toBe('-5 kg, -2 reps')
  })

  it('série idêntica não é progresso nem regressão', () => {
    const c = compareSets({ weight: 45, reps: 10 }, { weight: 45, reps: 10 })
    expect(c.label).toBe('igual à última')
    expect(c.direction).toBe('same')
  })

  it('usa singular em uma repetição', () => {
    expect(compareSets({ weight: 45, reps: 11 }, { weight: 45, reps: 10 }).label).toBe(
      'mesma carga, +1 rep',
    )
  })
})

describe('bestSet', () => {
  it('escolhe pela melhor série estimada, não pela carga mais alta', () => {
    const best = bestSet([
      { weight: 50, reps: 5 }, // e1RM 58,3
      { weight: 45, reps: 12 }, // e1RM 63,0
      { weight: 40, reps: 10 }, // e1RM 53,3
    ])
    expect(best).toEqual({ weight: 45, reps: 12 })
  })

  it('sem séries devolve null', () => {
    expect(bestSet([])).toBeNull()
  })
})

describe('suggestProgression', () => {
  const cfg = (
    over: Partial<
      Pick<Exercise, 'rep_floor' | 'rep_ceiling' | 'weight_increment' | 'muscle_group'>
    > = {},
  ): Pick<Exercise, 'rep_floor' | 'rep_ceiling' | 'weight_increment' | 'muscle_group'> => ({
    rep_floor: 8,
    rep_ceiling: 12,
    weight_increment: 2.5,
    muscle_group: 'peito',
    ...over,
  })

  it('sugere subir quando bateu o teto em todas as séries da última sessão', () => {
    const logs = [
      log({ day: '2026-01-05', weight: 40, reps: 10, set_number: 1 }),
      log({ day: '2026-01-12', weight: 40, reps: 13, set_number: 1 }),
      log({ day: '2026-01-12', weight: 40, reps: 12, set_number: 2 }),
    ]
    const s = suggestProgression(logs, cfg())
    expect(s?.action).toBe('increase')
    expect(s?.weight).toBe(42.5)
    expect(s?.from).toBe(40)
  })

  it('sugere baixar quando alguma série cai abaixo do piso', () => {
    const logs = [
      log({ day: '2026-01-05', weight: 40, reps: 10, set_number: 1, session_id: 's1' }),
      log({ day: '2026-01-05', weight: 40, reps: 6, set_number: 2, session_id: 's1' }),
    ]
    const s = suggestProgression(logs, cfg())
    expect(s?.action).toBe('decrease')
    expect(s?.weight).toBe(37.5)
    expect(s?.from).toBe(40)
  })

  it('dentro da faixa, sem sessões suficientes, não sugere nada', () => {
    const logs = [
      log({ day: '2026-01-05', weight: 40, reps: 10 }),
      log({ day: '2026-01-12', weight: 40, reps: 10 }),
    ]
    expect(suggestProgression(logs, cfg())).toBeNull()
  })

  it('sugere deload quando o 1RM estimado estagna por várias sessões dentro da faixa', () => {
    const days = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02']
    const logs = days.map((day) => log({ day, weight: 40, reps: 10 }))
    const s = suggestProgression(logs, cfg())
    expect(s?.action).toBe('deload')
    expect(s?.from).toBe(40)
    expect(s?.weight).toBe(35)
  })

  it('cardio nunca recebe sugestão', () => {
    const logs = [log({ day: '2026-01-05', weight: 40, reps: 20 })]
    expect(suggestProgression(logs, cfg({ muscle_group: 'cardio' }))).toBeNull()
  })

  it('sem histórico ou com parâmetros inválidos não sugere nada', () => {
    expect(suggestProgression([], cfg())).toBeNull()
    const logs = [log({ day: '2026-01-05', weight: 40, reps: 10 })]
    expect(suggestProgression(logs, cfg({ weight_increment: 0 }))).toBeNull()
    expect(suggestProgression(logs, cfg({ rep_floor: 12, rep_ceiling: 8 }))).toBeNull()
  })
})

describe('weekKeyOf', () => {
  it('datas na mesma semana (segunda a domingo) têm a mesma chave', () => {
    const monday = weekKeyOf(new Date('2026-03-09T08:00:00'))
    const friday = weekKeyOf(new Date('2026-03-13T20:00:00'))
    const sunday = weekKeyOf(new Date('2026-03-15T23:00:00'))
    expect(friday).toBe(monday)
    expect(sunday).toBe(monday)
  })

  it('a semana seguinte tem uma chave diferente', () => {
    const thisWeek = weekKeyOf(new Date('2026-03-09T08:00:00'))
    const nextWeek = weekKeyOf(new Date('2026-03-16T08:00:00'))
    expect(nextWeek).not.toBe(thisWeek)
  })
})

describe('parseLocalDate', () => {
  it('mantem o dia calendario independente do fuso, ao contrario de parseISO puro', () => {
    const date = parseLocalDate('2026-03-09')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(9)
    expect(date.getHours()).toBe(0)
  })
})

describe('timeBreakdown', () => {
  const sessao = { duration_seconds: 3600 }

  it('separa descanso real de tempo ativo', () => {
    // 1ª série não tem descanso antes; as outras somam 90+120+90 = 300s
    const t = timeBreakdown(sessao, [
      { rest_taken_seconds: 0 },
      { rest_taken_seconds: 90 },
      { rest_taken_seconds: 120 },
      { rest_taken_seconds: 90 },
    ])
    expect(t.restSeconds).toBe(300)
    expect(t.activeSeconds).toBe(3300)
    expect(t.restShare).toBeCloseTo(300 / 3600, 6)
  })

  it('ignora a série sem descanso anterior na média', () => {
    const t = timeBreakdown(sessao, [
      { rest_taken_seconds: 0 },
      { rest_taken_seconds: 100 },
      { rest_taken_seconds: 200 },
    ])
    expect(t.measuredIntervals).toBe(2)
    expect(t.avgRestSeconds).toBe(150)
  })

  it('compara o descanso real com o planejado', () => {
    const t = timeBreakdown(
      sessao,
      [{ rest_taken_seconds: 0 }, { rest_taken_seconds: 130 }],
      [90, 90],
    )
    expect(t.avgRestSeconds).toBe(130)
    expect(t.avgPlannedSeconds).toBe(90)
  })

  it('não deixa o descanso passar da duração do treino', () => {
    const t = timeBreakdown({ duration_seconds: 100 }, [{ rest_taken_seconds: 500 }])
    expect(t.restSeconds).toBe(100)
    expect(t.activeSeconds).toBe(0)
  })

  it('treino sem séries não quebra', () => {
    const t = timeBreakdown({ duration_seconds: 0 }, [])
    expect(t.restShare).toBe(0)
    expect(t.avgRestSeconds).toBe(0)
    expect(t.measuredIntervals).toBe(0)
  })
})

function routine(name: string, scheduled_days: Weekday[], archived = false): Routine {
  return {
    id: name,
    user_id: null,
    name,
    position: 0,
    scheduled_days,
    archived,
    updated_at: iso('2026-03-01'),
  }
}

/** Seg/qua/sex, com sabado de folga declarada. */
const MWF = [routine('A', [1]), routine('B', [3]), routine('C', [5])]

describe('scheduleOf', () => {
  it('reune os dias marcados nos treinos ativos', () => {
    expect(scheduleOf(MWF, { rest_days: [] }).dueDays).toEqual([1, 3, 5])
  })

  it('dia de descanso vence o dia marcado no treino', () => {
    const schedule = scheduleOf(MWF, { rest_days: [3] })
    expect(schedule.dueDays).toEqual([1, 5])
    expect(schedule.restDays).toEqual([3])
  })

  it('ignora treino arquivado', () => {
    const schedule = scheduleOf([...MWF, routine('D', [2], true)], { rest_days: [] })
    expect(schedule.dueDays).toEqual([1, 3, 5])
  })

  it('routinesForDay devolve os treinos daquele dia', () => {
    expect(routinesForDay(MWF, 3).map((r) => r.name)).toEqual(['B'])
    expect(routinesForDay(MWF, 2)).toEqual([])
  })
})

describe('computeScheduleStreak', () => {
  const schedule = scheduleOf(MWF, { rest_days: [] })

  it('conta cada dia cobrado que foi cumprido', () => {
    const sessions = ['2026-03-02', '2026-03-04', '2026-03-06'].map((d) => session(d))
    const streak = computeScheduleStreak(sessions, schedule, new Date(2026, 2, 6))
    expect(streak.mode).toBe('agenda')
    expect(streak.current).toBe(3)
    expect(streak.longest).toBe(3)
  })

  it('faltar num dia cobrado zera a corrente', () => {
    // 04/03 (quarta) ficou em branco.
    const sessions = ['2026-03-02', '2026-03-06'].map((d) => session(d))
    const streak = computeScheduleStreak(sessions, schedule, new Date(2026, 2, 6))
    expect(streak.current).toBe(1)
    expect(streak.longest).toBe(1)
    expect(streak.missedAt).toBe('2026-03-04')
  })

  it('treino em dia livre nao soma nem quebra', () => {
    const sessions = ['2026-03-02', '2026-03-03', '2026-03-04'].map((d) => session(d))
    const streak = computeScheduleStreak(sessions, schedule, new Date(2026, 2, 4))
    expect(streak.current).toBe(2)
  })

  it('dia de descanso nunca cobra, mesmo com treino marcado nele', () => {
    const folga = scheduleOf(MWF, { rest_days: [3] })
    // Faltou na quarta, mas quarta virou descanso: a corrente segue.
    const sessions = ['2026-03-02', '2026-03-06'].map((d) => session(d))
    const streak = computeScheduleStreak(sessions, folga, new Date(2026, 2, 6))
    expect(streak.current).toBe(2)
    expect(streak.missedAt).toBeNull()
  })

  it('hoje ainda nao quebra: o dia so cobra depois que vira', () => {
    const sessions = ['2026-03-02', '2026-03-04'].map((d) => session(d))
    // Sexta 06/03 e cobrada e ainda nao foi feita.
    const streak = computeScheduleStreak(sessions, schedule, new Date(2026, 2, 6))
    expect(streak.current).toBe(2)
    expect(streak.pendingToday).toBe(true)
  })

  it('sessao nao concluida nao vale como compromisso cumprido', () => {
    const sessions = [session('2026-03-02'), session('2026-03-04', false)]
    const streak = computeScheduleStreak(sessions, schedule, new Date(2026, 2, 5))
    expect(streak.current).toBe(0)
    expect(streak.missedAt).toBe('2026-03-04')
  })

  it('sem nenhum dia marcado, volta para a corrente por tolerancia', () => {
    const livre = scheduleOf([routine('A', [])], { rest_days: [] })
    const sessions = ['2026-03-02', '2026-03-04', '2026-03-06'].map((d) => session(d))
    const streak = computeScheduleStreak(sessions, livre, new Date(2026, 2, 6))
    expect(streak.mode).toBe('livre')
    expect(streak.current).toBe(3)
  })

  it('marca o descanso de hoje para a tela saber o que dizer', () => {
    const folga = scheduleOf(MWF, { rest_days: [0] })
    const streak = computeScheduleStreak([session('2026-03-02')], folga, new Date(2026, 2, 8))
    expect(streak.restToday).toBe(true)
    expect(streak.pendingToday).toBe(false)
  })

  it('nao cobra dias anteriores ao primeiro treino registrado', () => {
    const sessions = [session('2026-03-16')]
    const streak = computeScheduleStreak(sessions, schedule, new Date(2026, 2, 16))
    expect(streak.current).toBe(1)
    expect(streak.missedAt).toBeNull()
  })
})

describe('series cronometradas', () => {
  const timed = (day: string, seconds: number, weight = 0, reps = 0) => ({
    ...log({ day, weight, reps }),
    duration_seconds: seconds,
  })

  it('recorde de uma prancha é o tempo, não o volume', () => {
    const history = [timed('2026-03-02', 30), timed('2026-03-05', 40)]
    expect(checkPR(timed('2026-03-08', 45), history).is_pr_volume).toBe(true)
    expect(checkPR(timed('2026-03-08', 35), history).is_pr_volume).toBe(false)
  })

  it('primeira vez cronometrada já é recorde', () => {
    expect(checkPR(timed('2026-03-02', 20), []).is_pr_volume).toBe(true)
  })

  it('carga também conta quando a prancha tem peso', () => {
    const history = [timed('2026-03-02', 40, 5)]
    const comPeso = checkPR(timed('2026-03-05', 40, 10), history)
    expect(comPeso.is_pr_weight).toBe(true)
    // Mesmo tempo não é recorde de tempo: empatar não conta.
    expect(comPeso.is_pr_volume).toBe(false)
  })

  it('não mistura séries de tempo com séries de repetição', () => {
    // 40 s valendo "volume" enorme não pode ofuscar um recorde de 12 reps.
    const history = [timed('2026-03-02', 40, 10), log({ day: '2026-03-03', weight: 20, reps: 10 })]
    expect(checkPR({ weight: 22, reps: 10, duration_seconds: null }, history).is_pr_weight).toBe(true)
  })

  it('setLabel escreve tempo em vez de reps', () => {
    expect(setLabel(timed('2026-03-02', 90))).toBe('1:30')
    expect(setLabel(timed('2026-03-02', 45, 10))).toBe('10 kg · 0:45')
    expect(setLabel(log({ day: '2026-03-02', weight: 40, reps: 12 }))).toBe('40×12')
  })
})
