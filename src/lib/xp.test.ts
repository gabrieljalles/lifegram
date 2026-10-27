import { describe, expect, it } from 'vitest'
import { computeXP, levelOf, titleOf, xpToReach } from './xp'
import { contextBreakdown, stageToday } from './rejections'
import { dailyMissions } from './missions'
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

  it('treino marcado e trilha; nãos não viram missão', () => {
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
    expect(missions.map((m) => m.id)).toEqual(['treino', 'trilha'])
    expect(missions.some((m) => m.id === 'trilha')).toBe(true)
  })

  it('treinou outro que nao o sugerido: mostra o que foi feito', () => {
    const missions = dailyMissions(
      {
        routines: [routine('A', [3]), routine('B', [1])],
        sessions: [
          {
            routine_id: 'B',
            routine_name: 'Treino B',
            started_at: iso('2026-10-14T08:00:00'),
            finished_at: iso('2026-10-14T09:00:00'),
          },
        ],
        settings: DEFAULT_SETTINGS,
        rejections: [],
        trackSteps: [],
      },
      now,
    )
    const treino = missions.find((m) => m.id === 'treino')!
    expect(treino).toMatchObject({ title: 'Treino B', done: true })
    expect(treino.routine?.id).toBe('B')
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
  it('treino fecha o dia; sequencia conta para tras', async () => {
    const { perfectDays, weeklyBoss } = await import('./missions')
    const naos = (day: string) => [1, 2, 3].map((h) => reg(`${day}T1${h}:00:00`))
    const sessions = ['2026-10-13', '2026-10-14'].map((d) => ({
      started_at: iso(`${d}T08:00:00`),
      finished_at: iso(`${d}T09:00:00`),
      routine_id: null,
    }))
    const rejections = [...naos('2026-10-13'), ...naos('2026-10-14'), ...naos('2026-10-10')]
    const perfect = perfectDays({ sessions, settings: DEFAULT_SETTINGS }, now)
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

describe('gerador do chefao', () => {
  it('mesma semana, mesmo chefao; semanas diferentes variam', async () => {
    const { generateBoss, weekSeed } = await import('./bossGen')
    const seg = weekSeed(new Date('2026-10-12T10:00:00'))
    expect(weekSeed(new Date('2026-10-18T22:00:00'))).toBe(seg)
    expect(weekSeed(new Date('2026-10-19T08:00:00'))).not.toBe(seg)
    expect(generateBoss(seg)).toEqual(generateBoss(seg))

    const nomes = new Set(Array.from({ length: 52 }, (_, i) => generateBoss(202600 + i).name))
    expect(nomes.size).toBeGreaterThan(20)
  })

  it('nome combina com as pecas', async () => {
    const { generateBoss } = await import('./bossGen')
    for (let seed = 0; seed < 200; seed++) {
      const boss = generateBoss(seed)
      if (boss.traits.eyes === 1) expect(boss.name.startsWith('Ciclope')).toBe(true)
    }
  })
})

describe('missao da trilha', () => {
  const row = (step_id: string, done: number, updated: string, completed: string | null) => ({
    id: step_id,
    user_id: null,
    track_id: 'carisma',
    step_id,
    attempts: done,
    done,
    easy: 0,
    hard: 0,
    completed_at: completed ? iso(completed) : null,
    skipped_at: null,
    updated_at: iso(updated),
  })

  it('degrau fechado hoje: mostra ele cumprido, nao o proximo', async () => {
    const { flatSteps, CARISMA } = await import('./tracks')
    const [first, second] = flatSteps(CARISMA).map(({ step }) => step)
    const input = {
      routines: [],
      sessions: [],
      settings: DEFAULT_SETTINGS,
      rejections: [],
      trackSteps: [row(first.id, 1, '2026-10-14T10:00:00', '2026-10-14T10:00:00')],
    }
    const hoje = dailyMissions(input, now).find((m) => m.id === 'trilha')!
    expect(hoje).toMatchObject({ title: first.name, done: true })
    // O proximo ja aparece no mesmo card, opcional.
    expect(hoje.next?.title).toBe(second.name)

    // No dia seguinte a missao ja aponta para o proximo, em aberto.
    const amanha = dailyMissions(input, new Date('2026-10-15T09:00:00')).find((m) => m.id === 'trilha')!
    expect(amanha).toMatchObject({ title: second.name, done: false })
    expect(amanha.next).toBeUndefined()
  })

  it('fez o proximo tambem: ele sobe e aparece um novo embaixo', async () => {
    const { flatSteps, CARISMA } = await import('./tracks')
    const [first, second, third] = flatSteps(CARISMA).map(({ step }) => step)
    const missao = dailyMissions(
      {
        routines: [],
        sessions: [],
        settings: DEFAULT_SETTINGS,
        rejections: [],
        trackSteps: [
          row(first.id, 1, '2026-10-14T10:00:00', '2026-10-14T10:00:00'),
          row(second.id, 1, '2026-10-14T11:00:00', '2026-10-14T11:00:00'),
        ],
      },
      now,
    ).find((m) => m.id === 'trilha')!
    expect(missao).toMatchObject({ title: second.name, done: true })
    expect(missao.next?.title).toBe(third.name)
  })
})
