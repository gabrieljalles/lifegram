import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAX_SETTINGS as S,
  apurar,
  darfDueDate,
  fixedIncomeNet,
  fixedIncomeRate,
  guessKind,
  iofRate,
  type RealizedEvent,
} from './taxes'

const ev = (
  patch: Partial<RealizedEvent> & Pick<RealizedEvent, 'date' | 'gain' | 'saleValue'>,
): RealizedEvent => ({
  asset: 'PETR4',
  kind: 'acao',
  bucket: 'comum',
  cost: patch.saleValue - patch.gain,
  withheld: 0,
  ...patch,
})

describe('renda fixa', () => {
  it('tabela regressiva pelos dias', () => {
    expect([1, 180, 181, 360, 361, 720, 721].map((d) => fixedIncomeRate(d, S))).toEqual([
      22.5, 22.5, 20, 20, 17.5, 17.5, 15,
    ])
  })

  it('IOF só antes de 30 dias', () => {
    expect([iofRate(1), iofRate(7), iofRate(29), iofRate(30)]).toEqual([96, 76, 3, 0])
  })

  it('líquido de 333 dias: 20% de IR, sem IOF', () => {
    expect(fixedIncomeNet(371, 333, S).net).toBeCloseTo(296.8)
  })
})

describe('apuração mensal — exemplo de março a junho', () => {
  const events = [
    ev({ date: '2026-03-10', saleValue: 8000, gain: -1000 }),
    ev({ date: '2026-04-10', saleValue: 12000, gain: 500 }),
    ev({ date: '2026-05-10', saleValue: 30000, gain: 2500 }),
    ev({ date: '2026-05-12', bucket: 'daytrade', saleValue: 5000, gain: -300 }),
    ev({ date: '2026-06-03', bucket: 'daytrade', saleValue: 9000, gain: 1000 }),
  ]
  const { months, losses } = apurar(events, S)
  const [mar, abr, mai, jun] = months

  it('março: isento, mas o prejuízo entra no saldo', () => {
    expect(mar.exempt).toBe(true)
    expect(mar.comum.lossAfter).toBe(1000)
    expect(mar.tax).toBe(0)
  })

  it('abril: lucro isento não consome o prejuízo', () => {
    expect(abr.exempt).toBe(true)
    expect(abr.exemptGain).toBe(500)
    expect(abr.comum.lossAfter).toBe(1000)
  })

  it('maio: passa dos 20 mil, abate o prejuízo, 15%; day trade separado', () => {
    expect(mai.exempt).toBe(false)
    expect(mai.comum).toMatchObject({ lossUsed: 1000, taxable: 1500, tax: 225 })
    expect(mai.daytrade.lossAfter).toBe(300)
    // dedo-duro: 0,005% de 30 mil = 1,50
    expect(mai.darf).toBeCloseTo(223.5)
    expect(mai.dueDate).toBe('2026-06-30')
  })

  it('junho: day trade abate só o prejuízo de day trade, 20% menos 1% retido', () => {
    expect(jun.daytrade).toMatchObject({ lossUsed: 300, taxable: 700, tax: 140 })
    expect(jun.darf).toBeCloseTo(130)
    expect(losses).toEqual({ comum: 0, daytrade: 0, fii: 0 })
  })
})

describe('apuração — regras de cada caixa', () => {
  it('ETF não tem isenção, mesmo em mês com poucas vendas', () => {
    const [m] = apurar(
      [ev({ date: '2026-03-02', kind: 'etf', asset: 'IVVB11', saleValue: 5000, gain: 400 })],
      S,
    ).months
    expect(m.comum.tax).toBe(60)
  })

  it('prejuízo de ação em mês isento abate lucro de ETF do mesmo mês', () => {
    const [m] = apurar(
      [
        ev({ date: '2026-03-02', saleValue: 4000, gain: -1000 }),
        ev({ date: '2026-03-05', kind: 'etf', asset: 'BOVA11', saleValue: 3000, gain: 300 }),
      ],
      S,
    ).months
    expect(m.comum.tax).toBe(0)
    expect(m.comum.lossAfter).toBe(700)
  })

  it('FII paga 20% sempre e tem saldo próprio', () => {
    const { months, losses } = apurar(
      [
        ev({
          date: '2026-03-02',
          bucket: 'fii',
          kind: 'fii',
          asset: 'KNRI11',
          saleValue: 3000,
          gain: -200,
        }),
        ev({ date: '2026-03-03', saleValue: 25000, gain: 1000 }),
        ev({
          date: '2026-04-02',
          bucket: 'fii',
          kind: 'fii',
          asset: 'KNRI11',
          saleValue: 3000,
          gain: 500,
        }),
      ],
      S,
    )
    expect(months[0].comum.tax).toBe(150) // prejuizo de FII nao abate acao
    expect(months[1].fii).toMatchObject({ lossUsed: 200, taxable: 300, tax: 60 })
    expect(losses.fii).toBe(0)
  })

  it('DARF abaixo de R$ 10 acumula para o mês seguinte', () => {
    const { months } = apurar(
      [
        ev({ date: '2026-03-02', kind: 'etf', saleValue: 1000, gain: 40, asset: 'BOVA11' }),
        ev({ date: '2026-04-02', kind: 'etf', saleValue: 1000, gain: 40, asset: 'BOVA11' }),
      ],
      S,
    )
    // 15% de 40 = 6 (o dedo-duro de R$ 0,05 e dispensado).
    expect(months[0]).toMatchObject({ darf: 0 })
    expect(months[0].carriedOut).toBeCloseTo(6)
    expect(months[1].darf).toBeCloseTo(12)
  })

  it('vencimento cai no último dia útil do mês seguinte', () => {
    // fevereiro/2026 -> 31/03/2026 (terca)
    expect(darfDueDate('2026-02')).toBe('2026-03-31')
    // julho/2026 -> 31/08/2026 (segunda); setembro/2026 -> 30/10/2026 (sexta)
    expect(darfDueDate('2026-09')).toBe('2026-10-30')
  })
})

describe('guessKind', () => {
  it('ação, BDR, renda fixa e o ambíguo final 11', () => {
    expect(guessKind('PETR4')).toBe('acao')
    expect(guessKind('AAPL34')).toBe('bdr')
    expect(guessKind('TESOURO SELIC 2029')).toBe('renda_fixa')
    expect(guessKind('KNRI11')).toBeNull()
  })
})
