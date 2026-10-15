import { describe, expect, it } from 'vitest'
import { computeXP, levelOf, titleOf, xpToReach } from './xp'
import { contextBreakdown, stageToday } from './rejections'
import { DAILY_NAOS, dailyMissions } from './missions'
import { DEFAULT_SETTINGS, type CourageRejection, type Routine } from './types'

const now = new Date('2026-10-14T15:00:00')
const iso = (s: string) => new Date(s).toISOString()

const reg = (
  happened: string,
  kind?: CourageRejection['kind'],
  context?: CourageRejection['context'],
): CourageRejection => ({
  id: happened + (kind ?? '') + (context ?? ''),
  user_id: null,
  note: null,
  kind,
  context,
  happened_at: iso(happened),
  updated_at: iso(happened),
})

describe('niveis', () => {
  it('curva 0, 100, 300, 600', () => {
    expect([1, 2, 3, 4].map(xpToReach)).toEqual([0, 100, 300, 600])
  })

  it('nivel pelo XP acumulado', () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(99)).toBe(1)
    expect(levelOf(100)).toBe(2)
    expect(levelOf(650)).toBe(4)
  })

  it('titulo acompanha o nivel', () => {
    expect(titleOf(1)).toBe('Novato')
    expect(titleOf(9)).toBe('Guerreiro')
  })
})

describe('computeXP', () => {
  it('soma treino, recorde, funil e trilha; hoje so o que caiu hoje', () => {
    const xp = computeXP(
      {
        sessions: [
          { started_at: iso('2026-10-14T08:00:00'), finished_at: iso('2026-10-14T09:00:00') },
          { started_at: iso('2026-10-10T08:00:00'), finished_at: null },
        ],
        setLogs: [{ completed_at: iso('2026-10-14T08:30:00'), is_pr_weight: true, is_pr_volume: false }],
        rejections: [reg('2026-10-14T12:00:00'), reg('2026-10-01T12:00:00', 'sexo')],
        trackSteps: [{ done: 2 }],
        attempts: [],
      },
      now,
    )
    expect(xp.breakdown.treino).toBe(125)
    expect(xp.breakdown.coragem).toBe(20 + 150 + 60)
    expect(xp.total).toBe(355)
    expect(xp.today).toBe(145)
    expect(xp.level).toBe(3)
    expect(xp.into).toBe(55)
    expect(xp.span).toBe(300)
  })
})

describe('contexto do funil', () => {
  it('ordena pela taxa de sim e ignora lugar sem registro', () => {
    const rows = contextBreakdown([
      reg('2026-10-14T10:00:00', 'nao', 'rua'),
      reg('2026-10-14T10:01:00', 'nao', 'rua'),
      reg('2026-10-14T10:02:00', 'sim', 'rua'),
      reg('2026-10-14T10:03:00', 'sim', 'festa'),
      reg('2026-10-14T10:04:00', 'nao'),
    ])
    expect(rows.map((r) => r.id)).toEqual(['festa', 'rua'])
    expect(rows[1].yesRate).toBeCloseTo(1 / 3)
  })

  it('conta so a etapa do dia', () => {
    const list = [reg('2026-10-14T10:00:00'), reg('2026-10-13T10:00:00'), reg('2026-10-14T11:00:00', 'sim')]
    expect(stageToday(list, 'nao', now)).toBe(1)
  })
})

describe('missoes do dia', () => {
  const routine = (id: string, days: number[]): Routine =>
    ({ id, name: `Treino ${id}`, position: 0, archived: false, scheduled_days: days }) as unknown as Routine

  it('treino marcado, naos e progresso', () => {
    const missions = dailyMissions(
      {
        routines: [routine('A', [3])],
        sessions: [],
        settings: DEFAULT_SETTINGS,
        rejections: [reg('2026-10-14T10:00:00')],
        trackSteps: [],
      },
      now,
    )
    const treino = missions.find((m) => m.id === 'treino')!
    expect(treino.title).toBe('Treino A')
    expect(treino.optional).toBe(false)
    const naos = missions.find((m) => m.id === 'naos')!
    expect(naos.progress).toEqual({ value: 1, target: DAILY_NAOS })
    expect(naos.done).toBe(false)
    expect(missions.some((m) => m.id === 'trilha')).toBe(true)
  })

  it('dia de descanso vira missao cumprida', () => {
    const missions = dailyMissions(
      {
        routines: [routine('A', [3])],
        sessions: [],
        settings: { ...DEFAULT_SETTINGS, rest_days: [3] },
        rejections: [],
        trackSteps: [],
      },
      now,
    )
    expect(missions[0]).toMatchObject({ id: 'descanso', done: true })
  })
})

describe('dia perfeito e chefao', () => {
  it('treino + 3 nãos fecha o dia; sequencia conta para tras', async () => {
    const { perfectDays, weeklyBoss } = await import('./missions')
    const naos = (day: string) => [1, 2, 3].map((h) => reg(`${day}T1${h}:00:00`))
    const sessions = ['2026-10-13', '2026-10-14'].map((d) => ({
      started_at: iso(`${d}T08:00:00`),
      finished_at: iso(`${d}T09:00:00`),
      routine_id: null,
    }))
    const rejections = [...naos('2026-10-13'), ...naos('2026-10-14'), ...naos('2026-10-10')]
    const perfect = perfectDays({ sessions, settings: DEFAULT_SETTINGS, rejections }, now)
    expect(perfect).toEqual({ total: 2, streak: 2, today: true })

    const boss = weeklyBoss(
      { routines: [], sessions, settings: DEFAULT_SETTINGS, rejections, trackSteps: [] },
      now,
    )
    // Sem agenda: 3 treinos + 10 nãos = 500 de vida; semana ja levou 200 + 120.
    expect(boss.hp).toBe(500)
    expect(boss.damage).toBe(320)
    expect(boss.defeated).toBe(false)
  })
})
