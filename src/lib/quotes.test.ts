import { describe, expect, it } from 'vitest'
import { isB3Ticker } from './quotes'

describe('isB3Ticker', () => {
  it('reconhece ações, units, FIIs, ETFs, BDRs e fracionário', () => {
    for (const t of ['PETR4', 'TAEE11', 'KNRI11', 'IVVB11', 'AAPL34', 'PETR4F'])
      expect(isB3Ticker(t)).toBe(true)
  })

  it('o resto fica com cotação manual', () => {
    for (const t of ['TESOURO SELIC 2029', 'CDB INTER', 'BTC', 'PETR'])
      expect(isB3Ticker(t)).toBe(false)
  })
})
