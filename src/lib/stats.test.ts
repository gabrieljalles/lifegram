import { describe, expect, it } from 'vitest'
import {
  bestSet,
  bucketize,
  checkPR,
  compareSets,
  computeStreak,
  epley1RM,
  formatClock,
  linearTrend,
  periodDelta,
  suggestLoadIncrease,
  summarizeExercise,
  timeBreakdown,
  totalVolume,
} from './stats'
import type { Session, SetLog } from './types'

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
    expect(totalVolume([{ reps: 10, weight: 60 }, { reps: 8, weight: 70 }])).toBe(1160)
  })

  it('aplica Epley e preserva a serie de 1 rep', () => {
    expect(epley1RM(100, 1)).toBe(100)
    expect(epley1RM(60, 10)).toBeCloseTo(80, 6)
    expect(epley1RM(0, 10)).toBe(0)
    expect(epley1RM(60, 0)).toBe(0)
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
})

describe('computeStreak', () => {
  it('nao quebra a corrente em um dia de descanso', () => {
    const sessions = ['2026-03-02', '2026-03-04', '2026-03-06', '2026-03-08'].map((d) =>
      session(d),
    )
    const streak = computeStreak(sessions, new Date('2026-03-09'))
    expect(streak.current).toBe(4)
    expect(streak.longest).toBe(4)
  })

  it('quebra depois de passar da tolerancia', () => {
    const sessions = ['2026-03-01', '2026-03-02', '2026-03-10', '2026-03-11'].map((d) =>
      session(d),
    )
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
    expect(periodDelta(buckets)).toBeCloseTo((700 - 600) / 600 * 100, 5)
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

describe('suggestLoadIncrease', () => {
  const teto = 15
  const incremento = 1

  it('sugere subir quando bateu o teto em todas as séries', () => {
    const s = suggestLoadIncrease(
      [
        { weight: 20, reps: 15 },
        { weight: 20, reps: 16 },
        { weight: 20, reps: 15 },
      ],
      teto,
      incremento,
    )
    expect(s?.weight).toBe(21)
    expect(s?.from).toBe(20)
    expect(s?.sets).toBe(3)
  })

  it('não sugere se uma única série ficou abaixo do teto', () => {
    const s = suggestLoadIncrease(
      [
        { weight: 20, reps: 15 },
        { weight: 20, reps: 15 },
        { weight: 20, reps: 9 },
      ],
      teto,
      incremento,
    )
    expect(s).toBeNull()
  })

  it('respeita teto e incremento próprios do exercício', () => {
    const sets = [
      { weight: 60, reps: 12 },
      { weight: 60, reps: 12 },
    ]
    expect(suggestLoadIncrease(sets, 12, 2.5)?.weight).toBe(62.5)
    expect(suggestLoadIncrease(sets, 15, 2.5)).toBeNull()
  })

  it('usa a maior carga da sessão como base', () => {
    const s = suggestLoadIncrease(
      [
        { weight: 20, reps: 15 },
        { weight: 22, reps: 15 },
      ],
      teto,
      incremento,
    )
    expect(s?.weight).toBe(23)
  })

  it('sem séries ou com parâmetros inválidos não sugere nada', () => {
    expect(suggestLoadIncrease([], teto, incremento)).toBeNull()
    expect(suggestLoadIncrease([{ weight: 20, reps: 15 }], 0, incremento)).toBeNull()
    expect(suggestLoadIncrease([{ weight: 20, reps: 15 }], teto, 0)).toBeNull()
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
    const t = timeBreakdown(sessao, [{ rest_taken_seconds: 0 }, { rest_taken_seconds: 130 }], [90, 90])
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
