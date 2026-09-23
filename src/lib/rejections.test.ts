import { describe, expect, it } from 'vitest'
import {
  PRAISES,
  REJECTION_BADGES,
  badgeFor,
  nextBadge,
  praiseFor,
  rejectionProgress,
  rejectionStreak,
  rejectionsThisWeek,
} from './rejections'
import type { CourageRejection } from './types'

const nao = (iso: string): CourageRejection => ({
  id: iso,
  user_id: null,
  note: null,
  happened_at: iso,
  updated_at: iso,
})

describe('faixas', () => {
  it('sem nenhum nao ainda nao ha faixa', () => {
    expect(badgeFor(0)).toBeNull()
    expect(nextBadge(0)?.at).toBe(1)
  })

  it('o primeiro nao ja vale faixa — a recompensa nao pode demorar', () => {
    expect(badgeFor(1)?.name).toBe('Quebrou o gelo')
  })

  it('fica na maior faixa alcancada, nao na ultima cruzada por acaso', () => {
    expect(badgeFor(37)?.at).toBe(25)
    expect(nextBadge(37)?.at).toBe(50)
  })

  it('depois da ultima faixa nao inventa proxima', () => {
    const ultima = REJECTION_BADGES[REJECTION_BADGES.length - 1]
    expect(nextBadge(ultima.at)).toBeNull()
    expect(rejectionProgress(ultima.at + 10).ratio).toBe(1)
  })

  it('as faixas sao crescentes', () => {
    const ats = REJECTION_BADGES.map((b) => b.at)
    expect([...ats].sort((a, b) => a - b)).toEqual(ats)
  })
})

describe('rejectionProgress', () => {
  it('mede o quanto falta para a proxima faixa', () => {
    const p = rejectionProgress(7)
    expect(p.badge?.at).toBe(5)
    expect(p.next?.at).toBe(10)
    expect(p.missing).toBe(3)
    expect(p.ratio).toBeCloseTo(2 / 5, 6)
  })

  it('comeca do zero antes da primeira faixa', () => {
    const p = rejectionProgress(0)
    expect(p.badge).toBeNull()
    expect(p.missing).toBe(1)
    expect(p.ratio).toBe(0)
  })

  it('cada nao empurra a barra para frente', () => {
    const anterior = rejectionProgress(11).ratio
    expect(rejectionProgress(12).ratio).toBeGreaterThan(anterior)
  })
})

describe('rejectionsThisWeek', () => {
  it('conta so a semana corrente (segunda a domingo)', () => {
    const hoje = new Date('2026-03-12T10:00:00') // quinta
    const lista = [
      nao('2026-03-09T09:00:00'), // segunda desta semana
      nao('2026-03-12T08:00:00'), // hoje
      nao('2026-03-08T20:00:00'), // domingo passado
    ]
    expect(rejectionsThisWeek(lista, hoje)).toBe(2)
  })

  it('lista vazia nao quebra', () => {
    expect(rejectionsThisWeek([], new Date('2026-03-12T10:00:00'))).toBe(0)
  })
})

describe('rejectionStreak', () => {
  it('conta dias seguidos ate hoje', () => {
    const hoje = new Date('2026-03-12T10:00:00')
    const lista = [
      nao('2026-03-12T09:00:00'),
      nao('2026-03-11T09:00:00'),
      nao('2026-03-10T09:00:00'),
    ]
    expect(rejectionStreak(lista, hoje)).toBe(3)
  })

  it('um dia de folga nao quebra, dois quebram', () => {
    const hoje = new Date('2026-03-12T10:00:00')
    expect(rejectionStreak([nao('2026-03-11T09:00:00')], hoje)).toBe(1)
    expect(rejectionStreak([nao('2026-03-09T09:00:00')], hoje)).toBe(0)
  })

  it('varios no mesmo dia contam como um dia', () => {
    const hoje = new Date('2026-03-12T10:00:00')
    const lista = [nao('2026-03-12T09:00:00'), nao('2026-03-12T18:00:00')]
    expect(rejectionStreak(lista, hoje)).toBe(1)
  })
})

describe('praiseFor', () => {
  it('sempre devolve uma frase, em qualquer sorteio', () => {
    for (const roll of [0, 0.5, 0.999, 1]) {
      expect(PRAISES).toContain(praiseFor(roll))
    }
  })

  it('sorteios diferentes dao frases diferentes', () => {
    expect(praiseFor(0)).not.toBe(praiseFor(0.9))
  })
})
