import { describe, expect, it } from 'vitest'
import {
  attemptSeries,
  attemptsPerWeek,
  confidenceOf,
  evaluateGoal,
  goalStats,
  movingAverage,
  overallScoreSeries,
  patternBreakdown,
  periodOf,
  scoreDistribution,
  scoreTimeline,
  weeklyStreak,
} from './courage'
import {
  COURAGE_PEOPLE_LABEL,
  COURAGE_PERIOD_LABEL,
  COURAGE_PLACE_LABEL,
  type CourageAttempt,
  type CourageGoal,
  type CourageScoreChange,
} from './types'

const at = (day: string, hour = 10) => `${day}T${String(hour).padStart(2, '0')}:00:00.000-03:00`

function attempt(
  partial: Partial<CourageAttempt> & { day: string; predicted: number },
): CourageAttempt {
  const { day, ...rest } = partial
  return {
    id: `${day}-${rest.predicted}-${rest.actual ?? 'x'}`,
    user_id: null,
    goal_id: 'g1',
    actual: null,
    feared: 'que ela achasse estranho',
    happened: 'ela agradeceu',
    outcome_ok: true,
    place: null,
    people: null,
    energy: null,
    note: null,
    planned_at: at(day, 10),
    completed_at: rest.actual === undefined || rest.actual === null ? null : at(day, 11),
    updated_at: at(day),
    ...rest,
  }
}

function goal(partial: Partial<CourageGoal> & { id: string; score: number }): CourageGoal {
  return {
    user_id: null,
    name: 'Elogiar a roupa de uma colega',
    description: null,
    parent_id: null,
    position: 0,
    normalized_at: null,
    archived: false,
    created_at: at('2026-03-01'),
    updated_at: at('2026-03-01'),
    ...partial,
  }
}

function change(
  goal_id: string,
  day: string,
  from_score: number,
  to_score: number,
): CourageScoreChange {
  return {
    id: `${goal_id}-${day}`,
    user_id: null,
    goal_id,
    from_score,
    to_score,
    reason: 'reavaliação',
    changed_at: at(day),
    updated_at: at(day),
  }
}

describe('movingAverage', () => {
  it('só começa quando há pontos suficientes para uma média de verdade', () => {
    expect(movingAverage([8, 6, 4, 2], 3)).toEqual([null, null, 6, 4])
  })
})

describe('confidenceOf', () => {
  it('abaixo de 3 tentativas não conclui nada', () => {
    expect(confidenceOf(2).level).toBe('insuficiente')
  })

  it('3 e 4 tentativas apenas sugerem', () => {
    expect(confidenceOf(3).level).toBe('sugestao')
    expect(confidenceOf(4).phrase).toBe('Por enquanto os dados sugerem')
  })

  it('de 5 em diante já é tendência', () => {
    expect(confidenceOf(5).level).toBe('tendencia')
  })
})

describe('goalStats', () => {
  const attempts = [
    attempt({ day: '2026-03-02', predicted: 8, actual: 5, outcome_ok: true }),
    attempt({ day: '2026-03-05', predicted: 7, actual: 4, outcome_ok: true }),
    attempt({ day: '2026-03-08', predicted: 6, actual: 3, outcome_ok: false }),
    attempt({ day: '2026-03-10', predicted: 6 }), // previsão em aberto
  ]

  it('só a tentativa completa entra nas médias', () => {
    const stats = goalStats(attempts)
    expect(stats.total).toBe(4)
    expect(stats.completed).toBe(3)
    expect(stats.pending).toBe(1)
    expect(stats.avgPredicted).toBe(7)
    expect(stats.avgActual).toBe(4)
  })

  it('erro de previsão positivo significa medo exagerando', () => {
    expect(goalStats(attempts).bias).toBe(3)
  })

  it('taxa de ok considera só as tentativas com resultado decidido', () => {
    expect(goalStats(attempts).okRate).toBeCloseTo(2 / 3)
  })

  it('sem tentativa completa não inventa número', () => {
    const stats = goalStats([attempt({ day: '2026-03-02', predicted: 9 })])
    expect(stats.completed).toBe(0)
    expect(stats.okRate).toBeNull()
    expect(stats.lastActual).toBeNull()
  })
})

describe('evaluateGoal', () => {
  it('não sugere reavaliar com menos de 3 tentativas completas', () => {
    const attempts = [
      attempt({ day: '2026-03-02', predicted: 9, actual: 3 }),
      attempt({ day: '2026-03-04', predicted: 9, actual: 2 }),
    ]
    const evaluation = evaluateGoal(goal({ id: 'g1', score: 9 }), attempts)
    expect(evaluation.readyToReevaluate).toBe(false)
    expect(evaluation.suggestedScore).toBeNull()
    expect(evaluation.status).toBe('andamento')
  })

  it('marca para reavaliar quando o real fica 2 pontos abaixo do previsto', () => {
    const attempts = [
      attempt({ day: '2026-03-02', predicted: 8, actual: 5 }),
      attempt({ day: '2026-03-05', predicted: 8, actual: 4 }),
      attempt({ day: '2026-03-08', predicted: 8, actual: 3 }),
    ]
    const evaluation = evaluateGoal(goal({ id: 'g1', score: 8 }), attempts)
    expect(evaluation.readyToReevaluate).toBe(true)
    expect(evaluation.status).toBe('reavaliar')
    expect(evaluation.suggestedScore).toBe(4)
  })

  it('diferença pequena não baixa nota nenhuma', () => {
    const attempts = [
      attempt({ day: '2026-03-02', predicted: 5, actual: 4 }),
      attempt({ day: '2026-03-05', predicted: 5, actual: 5 }),
      attempt({ day: '2026-03-08', predicted: 5, actual: 4 }),
    ]
    expect(evaluateGoal(goal({ id: 'g1', score: 5 }), attempts).readyToReevaluate).toBe(false)
  })

  it('nota 0 com as três últimas ok vira normalizado', () => {
    const attempts = [
      attempt({ day: '2026-03-02', predicted: 2, actual: 1, outcome_ok: true }),
      attempt({ day: '2026-03-05', predicted: 1, actual: 0, outcome_ok: true }),
      attempt({ day: '2026-03-08', predicted: 1, actual: 0, outcome_ok: true }),
    ]
    expect(evaluateGoal(goal({ id: 'g1', score: 0 }), attempts).status).toBe('normalizado')
  })

  it('nota 0 com resultado ruim recente não normaliza', () => {
    const attempts = [
      attempt({ day: '2026-03-02', predicted: 2, actual: 1, outcome_ok: true }),
      attempt({ day: '2026-03-05', predicted: 1, actual: 1, outcome_ok: true }),
      attempt({ day: '2026-03-08', predicted: 1, actual: 2, outcome_ok: false }),
    ]
    expect(evaluateGoal(goal({ id: 'g1', score: 0 }), attempts).status).toBe('andamento')
  })

  it('nota alta que não cede sugere quebrar em passos menores', () => {
    const attempts = [8, 8, 9, 8, 9].map((actual, index) =>
      attempt({ day: `2026-03-0${index + 2}`, predicted: 9, actual }),
    )
    const evaluation = evaluateGoal(goal({ id: 'g1', score: 9 }), attempts)
    expect(evaluation.shouldSplit).toBe(true)
  })

  it('não sugere quebrar um objetivo que já tem sub-objetivos', () => {
    const attempts = [8, 8, 9, 8, 9].map((actual, index) =>
      attempt({ day: `2026-03-0${index + 2}`, predicted: 9, actual }),
    )
    expect(evaluateGoal(goal({ id: 'g1', score: 9 }), attempts, true).shouldSplit).toBe(false)
  })
})

describe('attemptSeries', () => {
  it('numera as tentativas e sobrepõe a média móvel', () => {
    const attempts = [8, 6, 4].map((actual, index) =>
      attempt({ day: `2026-03-0${index + 2}`, predicted: 9, actual }),
    )
    const series = attemptSeries(attempts, 3)
    expect(series.map((p) => p.label)).toEqual(['1', '2', '3'])
    expect(series.map((p) => p.media)).toEqual([null, null, 6])
  })
})

describe('scoreTimeline', () => {
  it('parte da nota original e desce a cada mudança confirmada', () => {
    const g = goal({ id: 'g1', score: 4 })
    const changes = [change('g1', '2026-03-10', 8, 6), change('g1', '2026-03-20', 6, 4)]
    expect(scoreTimeline(g, changes).map((p) => p.nota)).toEqual([8, 6, 4])
  })

  it('objetivo sem mudança nenhuma mostra só a nota atual', () => {
    expect(scoreTimeline(goal({ id: 'g1', score: 7 }), []).map((p) => p.nota)).toEqual([7])
  })
})

describe('attemptsPerWeek e meta semanal', () => {
  const today = new Date(2026, 2, 22, 12) // domingo, 22/03/2026
  const attempts = [
    // semana de 09/03: 3 tentativas
    attempt({ day: '2026-03-09', predicted: 5, actual: 4 }),
    attempt({ day: '2026-03-10', predicted: 5, actual: 4 }),
    attempt({ day: '2026-03-11', predicted: 5, actual: 3 }),
    // semana de 16/03: 3 tentativas
    attempt({ day: '2026-03-16', predicted: 5, actual: 3 }),
    attempt({ day: '2026-03-17', predicted: 5, actual: 3 }),
    attempt({ day: '2026-03-18', predicted: 5, actual: 2 }),
  ]

  it('conta as tentativas completas de cada semana', () => {
    // Domingo 22/03 pertence a semana que comeca na segunda 16/03, entao as
    // tres ultimas semanas sao 02/03 (vazia), 09/03 e 16/03.
    const weeks = attemptsPerWeek(attempts, 3, today)
    expect(weeks.map((w) => w.label)).toEqual(['02/03', '09/03', '16/03'])
    expect(weeks.map((w) => w.tentativas)).toEqual([0, 3, 3])
  })

  it('previsão em aberto não conta para a meta', () => {
    const weeks = attemptsPerWeek(
      [...attempts, attempt({ day: '2026-03-19', predicted: 5 })],
      3,
      today,
    )
    expect(weeks[weeks.length - 1].tentativas).toBe(3)
  })

  it('a semana corrente em aberto não quebra a sequência', () => {
    expect(weeklyStreak(attempts, 3, today)).toBe(2)
  })

  it('semana fechada abaixo da meta quebra a sequência', () => {
    // Segunda 23/03: a semana de 16/03 fechou com uma tentativa so.
    const segunda = new Date(2026, 2, 23, 9)
    expect(weeklyStreak(attempts.slice(0, 4), 3, segunda)).toBe(0)
  })
})

describe('scoreDistribution', () => {
  it('conta objetivos ativos por nota', () => {
    const goals = [
      goal({ id: 'a', score: 0 }),
      goal({ id: 'b', score: 3 }),
      goal({ id: 'c', score: 3 }),
      goal({ id: 'd', score: 9, archived: true }),
    ]
    const dist = scoreDistribution(goals)
    expect(dist[0].objetivos).toBe(1)
    expect(dist[3].objetivos).toBe(2)
    expect(dist[9].objetivos).toBe(0)
  })
})

describe('overallScoreSeries', () => {
  it('reconstrói a média das notas a partir do histórico de mudanças', () => {
    const goals = [goal({ id: 'a', score: 4 }), goal({ id: 'b', score: 6 })]
    const changes = [change('a', '2026-03-10', 8, 4)]
    const series = overallScoreSeries(goals, changes, new Date(2026, 2, 20))
    expect(series.map((p) => p.media)).toEqual([7, 5, 5])
  })

  it('sem objetivo ativo não desenha nada', () => {
    expect(overallScoreSeries([goal({ id: 'a', score: 4, archived: true })], [])).toEqual([])
  })
})

describe('patternBreakdown', () => {
  const labels = {
    period: COURAGE_PERIOD_LABEL,
    place: COURAGE_PLACE_LABEL,
    people: COURAGE_PEOPLE_LABEL,
  }

  it('fica fechada antes de 15 tentativas completas', () => {
    const attempts = Array.from({ length: 14 }, (_, i) =>
      attempt({ day: `2026-03-${String(i + 1).padStart(2, '0')}`, predicted: 6, actual: 4 }),
    )
    expect(patternBreakdown(attempts, labels).available).toBe(false)
  })

  it('agrupa por ambiente e ordena do mais fácil para o mais difícil', () => {
    const attempts = Array.from({ length: 16 }, (_, i) =>
      attempt({
        day: `2026-03-${String(i + 1).padStart(2, '0')}`,
        predicted: 6,
        actual: i % 2 === 0 ? 2 : 8,
        place: i % 2 === 0 ? 'online' : 'evento',
      }),
    )
    const patterns = patternBreakdown(attempts, labels)
    expect(patterns.available).toBe(true)
    expect(patterns.byPlace.map((g) => g.label)).toEqual(['Online', 'Evento'])
    expect(patterns.byPlace[0].avgActual).toBe(2)
  })

  it('grupo com uma tentativa só não vira padrão', () => {
    const attempts = Array.from({ length: 16 }, (_, i) =>
      attempt({
        day: `2026-03-${String(i + 1).padStart(2, '0')}`,
        predicted: 6,
        actual: 4,
        place: i === 0 ? 'evento' : 'online',
      }),
    )
    expect(patternBreakdown(attempts, labels).byPlace.map((g) => g.key)).toEqual(['online'])
  })
})

describe('periodOf', () => {
  it('separa manhã, tarde e noite pelo horário local', () => {
    expect(periodOf(at('2026-03-02', 9))).toBe('manha')
    expect(periodOf(at('2026-03-02', 15))).toBe('tarde')
    expect(periodOf(at('2026-03-02', 21))).toBe('noite')
  })
})

describe('reavaliação repetida', () => {
  it('para de insistir quando a nota oficial já bate com a média real', () => {
    const attempts = [
      attempt({ day: '2026-03-02', predicted: 8, actual: 3 }),
      attempt({ day: '2026-03-05', predicted: 8, actual: 3 }),
      attempt({ day: '2026-03-08', predicted: 7, actual: 3 }),
    ]
    // Antes de reavaliar: a nota 8 está muito acima do real.
    expect(evaluateGoal(goal({ id: 'g1', score: 8 }), attempts).readyToReevaluate).toBe(true)
    // Depois de baixar para 3, não há mais o que sugerir.
    const depois = evaluateGoal(goal({ id: 'g1', score: 3 }), attempts)
    expect(depois.readyToReevaluate).toBe(false)
    expect(depois.status).toBe('andamento')
    expect(depois.message).toContain('calibrada')
  })
})
