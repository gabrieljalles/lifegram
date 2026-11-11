import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FACTORS,
  activeFactors,
  autoFactors,
  closingDay,
  formatSleep,
  previousDay,
  toggleWord,
} from './checkin'
import { itemTypeOf } from './items'

describe('check-in', () => {
  it('limita a 3 palavras e desmarca', () => {
    expect(toggleWord(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
    expect(toggleWord(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c'])
    expect(toggleWord(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('formata o sono', () => {
    expect(formatSleep(430)).toBe('7h10')
    expect(formatSleep(360)).toBe('6h')
    expect(formatSleep(null)).toBe('—')
  })

  it('treino depois das 20h e preenchido pelo treino do dia', () => {
    const s = (started: string) => ({ started_at: started, finished_at: started })
    expect(autoFactors('2026-11-11', [])).toEqual({})
    expect(autoFactors('2026-11-11', [s('2026-11-11T18:30:00')])).toEqual({ treino_tarde: false })
    expect(autoFactors('2026-11-11', [s('2026-11-11T20:15:00')])).toEqual({ treino_tarde: true })
    expect(
      autoFactors('2026-11-11', [{ started_at: '2026-11-11T21:00:00', finished_at: null }]),
    ).toEqual({})
  })

  it('de madrugada ainda fecha o dia anterior', () => {
    expect(closingDay(new Date(2026, 10, 12, 1, 30))).toBe('2026-11-11')
    expect(closingDay(new Date(2026, 10, 11, 22, 0))).toBe('2026-11-11')
    expect(previousDay('2026-11-01')).toBe('2026-10-31')
  })

  it('pergunta desligada some, mas a lista padrao tem todas', () => {
    expect(DEFAULT_FACTORS.map((f) => f.id)).toContain('treino_tarde')
    const off = DEFAULT_FACTORS.map((f) => (f.id === 'cochilo' ? { ...f, off: true } : f))
    expect(activeFactors({ checkin_factors: off }).some((f) => f.id === 'cochilo')).toBe(false)
  })
})

describe('tipo do item', () => {
  it('deduz o tipo das linhas antigas', () => {
    expect(itemTypeOf({ icon: '💊', kind: 'recorrente' })).toBe('remedio')
    expect(itemTypeOf({ icon: '📖', kind: 'esporadica' })).toBe('compromisso')
    expect(itemTypeOf({ icon: '📖', kind: 'recorrente' })).toBe('habito')
    expect(itemTypeOf({ icon: '💊', kind: 'recorrente', item_type: 'coragem' })).toBe('coragem')
  })
})
