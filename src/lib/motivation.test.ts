import { describe, expect, it } from 'vitest'
import { pickPhrase } from './motivation'
import type { MotivationPhrase } from './types'

const phrase = (id: string): MotivationPhrase => ({
  id,
  user_id: null,
  text: `frase ${id}`,
  author: null,
  deleted: false,
  created_at: '2026-11-04T00:00:00.000Z',
  updated_at: '2026-11-04T00:00:00.000Z',
})

describe('pickPhrase', () => {
  it('sem frases, nada', () => {
    expect(pickPhrase([], 0.5, null)).toBeNull()
  })

  it('com uma frase so, mostra ela mesmo que tenha sido a ultima', () => {
    expect(pickPhrase([phrase('a')], 0.9, 'a')?.id).toBe('a')
  })

  it('nunca repete a ultima em seguida', () => {
    const list = [phrase('a'), phrase('b'), phrase('c')]
    for (const seed of [0, 0.2, 0.5, 0.8, 0.9999]) {
      expect(pickPhrase(list, seed, 'b')?.id).not.toBe('b')
    }
  })

  it('o sorteio cobre todas as outras', () => {
    const list = [phrase('a'), phrase('b'), phrase('c')]
    const seen = new Set([0, 0.4, 0.7, 0.99].map((s) => pickPhrase(list, s, 'a')?.id))
    expect(seen).toEqual(new Set(['b', 'c']))
  })

  it('seed 1 nao estoura o indice', () => {
    expect(pickPhrase([phrase('a'), phrase('b')], 1, null)?.id).toBe('b')
  })
})
