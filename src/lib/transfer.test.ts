import { describe, expect, it } from 'vitest'
import { categoriesIn, fileName, normalizeName, preparePlan, type TransferFile } from './transfer'
import type { Exercise } from './types'

const STAMP = '2026-11-02T12:00:00.000Z'
const UUID_A = '11111111-1111-4111-8111-111111111111'

const exercise = (over: Partial<Exercise>): Exercise => ({
  id: UUID_A,
  user_id: 'u1',
  name: 'Supino reto',
  muscle_group: 'peito',
  photo_url: 'https://foto',
  photo_local_key: 'k1',
  default_rest_seconds: 120,
  measure: 'reps',
  segments: [],
  rep_floor: 6,
  rep_ceiling: 10,
  weight_increment: 2,
  notes: null,
  archived: false,
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('preparePlan', () => {
  it('casa exercicio da IA pelo nome e remapeia as referencias', () => {
    const file: TransferFile = {
      exercises: [{ id: 'ex-supino', name: 'Supino  Reto' } as never],
      routines: [{ id: 'treino-a', name: 'Treino A', scheduled_days: [1, 4, 9] } as never],
      routine_exercises: [
        {
          routine_id: 'treino-a',
          exercise_id: 'ex-supino',
          target_sets: 4,
          target_reps: 8,
        } as never,
      ],
    }
    const plan = preparePlan(file, [exercise({})], STAMP)
    expect(plan.matchedByName).toBe(1)
    // Exercicio local nao e reescrito (nem a foto, nem a faixa de reps).
    expect(plan.exercises).toHaveLength(0)
    expect(plan.routines[0].scheduled_days).toEqual([1, 4])
    expect(plan.routines[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(plan.routine_exercises[0]).toMatchObject({
      routine_id: plan.routines[0].id,
      exercise_id: UUID_A,
      target_sets: 4,
      target_reps: 8,
      target_weight: 0,
      rest_seconds: null,
      updated_at: STAMP,
    })
  })

  it('desarquiva o exercicio reconhecido pelo nome', () => {
    const plan = preparePlan(
      { exercises: [{ id: 'x', name: 'supino reto' } as never] },
      [exercise({ archived: true })],
      STAMP,
    )
    expect(plan.exercises).toEqual([expect.objectContaining({ id: UUID_A, archived: false })])
  })

  it('mesmo id: o arquivo vence, mas a foto local fica', () => {
    const plan = preparePlan(
      {
        exercises: [
          { ...exercise({}), name: 'Supino inclinado', rep_ceiling: 12, photo_url: null } as never,
        ],
      },
      [exercise({})],
      STAMP,
    )
    expect(plan.exercises[0]).toMatchObject({
      id: UUID_A,
      name: 'Supino inclinado',
      rep_ceiling: 12,
      photo_url: 'https://foto',
      updated_at: STAMP,
    })
  })

  it('exercicio novo ganha os padroes do app', () => {
    const plan = preparePlan(
      { exercises: [{ id: 'ex-1', name: 'Remada', muscle_group: 'invalido' } as never] },
      [],
      STAMP,
    )
    expect(plan.exercises[0]).toMatchObject({
      name: 'Remada',
      muscle_group: 'outro',
      measure: 'reps',
      archived: false,
      photo_url: null,
    })
    expect(plan.exercises[0].id).not.toBe('ex-1')
  })

  it('aceita referencia direta a um exercicio local que nao veio no arquivo', () => {
    const plan = preparePlan(
      {
        routines: [{ id: 'r', name: 'B' } as never],
        routine_exercises: [{ routine_id: 'r', exercise_id: UUID_A } as never],
      },
      [exercise({})],
      STAMP,
    )
    expect(plan.routine_exercises[0].exercise_id).toBe(UUID_A)
  })

  it('descarta item que aponta para exercicio inexistente', () => {
    const plan = preparePlan(
      {
        routines: [{ id: 'r', name: 'B' } as never],
        routine_exercises: [{ routine_id: 'r', exercise_id: 'nao-existe' } as never],
      },
      [],
      STAMP,
    )
    expect(plan.routine_exercises).toHaveLength(0)
  })
})

describe('categorias', () => {
  it('detecta so o que tem dado', () => {
    expect(
      categoriesIn({ routines: [{} as never], sessions: [], body_weight_logs: [{} as never] }),
    ).toEqual(['plano', 'peso'])
    expect(categoriesIn({ settings: {} as never })).toEqual(['ajustes'])
  })

  it('nome do arquivo', () => {
    const day = new Date('2026-11-02T12:00:00Z')
    expect(fileName(['plano'], day)).toBe('lifegram-plano-2026-11-02.json')
    expect(
      fileName(['plano', 'historico', 'peso', 'coragem', 'agenda', 'financeiro', 'ajustes'], day),
    ).toBe('lifegram-backup-2026-11-02.json')
  })

  it('normaliza nome sem acento e caixa', () => {
    expect(normalizeName('  Elevação-Lateral ')).toBe('elevacao lateral')
  })
})
