import { describe, expect, it } from 'vitest'
import {
  assetKey,
  availableToSell,
  capitalTimeline,
  holdingTime,
  ledger,
  portfolio,
  previewSale,
  priceOn,
  selicIndex,
  sellSignals,
  type PortfolioInput,
  type SelicRates,
} from './invest'
import { DEFAULT_TAX_SETTINGS, fixedIncomeNet } from './taxes'
import type { InvestmentBuy, InvestmentQuote, InvestmentSale } from './types'

const buy = (asset: string, quantity: number, price: number, bought_on: string): InvestmentBuy => ({
  id: `${asset}-${bought_on}-${price}`,
  user_id: null,
  asset,
  quantity,
  price,
  bought_on,
  deleted: false,
  created_at: `${bought_on}T10:00:00.000Z`,
  updated_at: `${bought_on}T10:00:00.000Z`,
})

const sale = (asset: string, quantity: number, price: number, sold_on: string): InvestmentSale => ({
  id: `s-${asset}-${sold_on}-${price}`,
  user_id: null,
  asset,
  quantity,
  price,
  sold_on,
  deleted: false,
  created_at: `${sold_on}T12:00:00.000Z`,
  updated_at: `${sold_on}T12:00:00.000Z`,
})

const quote = (asset: string, price: number, quoted_on: string): InvestmentQuote => ({
  id: `q-${asset}-${quoted_on}`,
  user_id: null,
  asset,
  price,
  quoted_on,
  updated_at: `${quoted_on}T10:00:00.000Z`,
})

// 1% por dia util para a conta fechar de cabeca. Fim de semana (03 e 04/10) sem taxa.
const rates: SelicRates = {
  '2026-10-01': 1,
  '2026-10-02': 1,
  '2026-10-05': 1,
  '2026-10-06': 1,
}
const index = selicIndex(rates)
const settings = DEFAULT_TAX_SETTINGS

const input = (
  patch: Partial<PortfolioInput> & Pick<PortfolioInput, 'buys' | 'today'>,
): PortfolioInput => ({ sales: [], quotes: [], index, settings, ...patch })

/** A Selic de `amount` com o fator do periodo, depois do IR e do IOF de `days` dias. */
const selicNet = (amount: number, factor: number, days: number) =>
  amount + fixedIncomeNet(amount * (factor - 1), days, settings).net

describe('selicIndex', () => {
  it('a taxa do dia da compra conta; a do dia final ainda não', () => {
    expect(index.factor('2026-10-01', '2026-10-02')).toBeCloseTo(1.01)
    // 01, 02 e 05 (o fim de semana nao rende).
    expect(index.factor('2026-10-01', '2026-10-06')).toBeCloseTo(1.01 ** 3)
    expect(index.factor('2026-10-06', '2026-10-06')).toBe(1)
  })

  it('anualiza pela última taxa (252 dias úteis)', () => {
    expect(selicIndex({ '2026-10-27': 0.050788 }).annual).toBeCloseTo(13.65, 1)
  })
})

describe('assetKey', () => {
  it('normaliza maiúsculas e espaços', () => {
    expect(assetKey('  tesouro   selic 2029 ')).toBe('TESOURO SELIC 2029')
  })
})

describe('priceOn', () => {
  it('cotação mais recente vence; no mesmo dia, cotação vence compra', () => {
    const buys = [buy('PETR4', 10, 30, '2026-10-01')]
    const quotes = [quote('PETR4', 32, '2026-10-01'), quote('PETR4', 35, '2026-10-05')]
    expect(priceOn('PETR4', '2026-10-01', buys, quotes)?.price).toBe(32)
    expect(priceOn('PETR4', '2026-10-04', buys, quotes)?.price).toBe(32)
    expect(priceOn('PETR4', '2026-10-06', buys, quotes)?.price).toBe(35)
  })

  it('a venda também é preço de mercado', () => {
    const buys = [buy('PETR4', 10, 30, '2026-10-01')]
    const sales = [sale('PETR4', 5, 33, '2026-10-05')]
    expect(priceOn('PETR4', '2026-10-06', buys, [], sales)?.price).toBe(33)
  })
})

describe('carteira contra a Selic, líquido com líquido', () => {
  const today = '2026-10-06'
  // Compra boa no dia 01 e compra "errada" (cara) no dia 05.
  const buys = [buy('PETR4', 10, 100, '2026-10-01'), buy('PETR4', 10, 110, '2026-10-05')]
  const quotes = [quote('PETR4', 104, today)]
  const { positions, summary } = portfolio(input({ buys, quotes, today }))
  const [p] = positions
  // Resgatar a Selic em 5 e 1 dia paga IOF (80% e 96% do rendimento) e 22,5% de IR.
  const net1 = selicNet(1000, 1.01 ** 3, 5)
  const net2 = selicNet(1100, 1.01, 1)

  it('cada compra rende Selic desde a própria data, bruto e líquido', () => {
    expect(p.buys[0].selicValue).toBeCloseTo(1000 * 1.01 ** 3)
    expect(p.buys[1].selicValue).toBeCloseTo(1100 * 1.01)
    expect(p.buys[0].selicNet).toBeCloseTo(net1)
    expect(p.selicNet).toBeCloseTo(net1 + net2)
  })

  it('ação com vendas do mês abaixo de 20 mil: sem imposto ao vender', () => {
    expect(p.avgPrice).toBeCloseTo(105)
    expect(p.taxIfSold).toBe(0)
    expect(p.netValue).toBeCloseTo(2080)
  })

  it('julga compra a compra e a posição como um todo', () => {
    expect(p.buys.map((b) => b.beat)).toEqual([true, false])
    expect(p.beat).toBe(false)
    expect(p.vsSelic).toBeCloseTo(2080 - net1 - net2)
    // Sem imposto, o empate e a Selic liquida dividida pelas unidades.
    expect(p.breakEven).toBeCloseTo((net1 + net2) / 20, 4)
  })

  it('o resumo soma as posições e conta as compras que batem', () => {
    const s = portfolio(
      input({ buys: [...buys, buy('VALE3', 5, 50, '2026-10-01')], quotes, today }),
    ).summary
    expect(s.invested).toBeCloseTo(2350)
    expect(s.buysTotal).toBe(3)
    // VALE3 sem cotacao fica no preco de compra: nao bate a Selic.
    expect(s.buysBeating).toBe(1)
    expect(summary.realized).toBeNull()
  })
})

describe('imposto se vendesse hoje: o acumulado do mês', () => {
  const today = '2026-10-20'
  const buys = [buy('VALE3', 300, 50, '2026-09-01'), buy('PETR4', 100, 40, '2026-09-01')]
  // Ja vendeu R$ 16.200 de acoes em outubro, com R$ 1.200 de lucro: isento sozinho.
  const sales = [sale('VALE3', 300, 54, '2026-10-05')]
  const quotes = [quote('PETR4', 45, today)]
  const { positions, summary, apuracao } = portfolio(input({ buys, sales, quotes, today }))

  it('a venda feita ainda está isenta', () => {
    expect(apuracao.months[0]).toMatchObject({ month: '2026-10', exempt: true, tax: 0 })
  })

  it('vender R$ 4.500 de PETR4 passa dos 20 mil e tributa o mês inteiro', () => {
    const [petr] = positions
    expect(petr.stockSalesIfSold).toBeCloseTo(20700)
    // 15% sobre 1.200 (venda ja feita) + 500 (esta).
    expect(petr.taxIfSold).toBeCloseTo(255)
    expect(petr.netValue).toBeCloseTo(4500 - 255)
    expect(summary.month).toMatchObject({ stockSales: 16200, stockSalesIfAll: 20700 })
  })

  it('o realizado entra na comparação com a Selic', () => {
    expect(summary.realized).toMatchObject({ proceeds: 16200, gain: 1200, tax: 0 })
    expect(summary.contributions.map((c) => c.asset)).toEqual(['PETR4', 'Vendas feitas'])
  })
})

describe('razão: day trade, preço médio e PEPS', () => {
  it('compra e venda no mesmo dia viram day trade; o resto é swing', () => {
    const l = ledger(
      'PETR4',
      input({
        buys: [buy('PETR4', 100, 10, '2026-10-01'), buy('PETR4', 50, 11, '2026-10-02')],
        sales: [sale('PETR4', 80, 12, '2026-10-02')],
        today: '2026-10-06',
      }),
    )
    expect(l.events).toMatchObject([
      { bucket: 'daytrade', saleValue: 600, cost: 550, gain: 50 },
      { bucket: 'comum', saleValue: 360, cost: 300, gain: 60 },
    ])
    expect(l.quantity).toBeCloseTo(70)
    expect(l.cost).toBeCloseTo(700)
    expect(l.sales[0]).toMatchObject({ dayTradeQty: 50, swingQty: 30 })
  })

  it('venda de ação tira de todas as compras na proporção (preço médio)', () => {
    const l = ledger(
      'PETR4',
      input({
        buys: [buy('PETR4', 10, 100, '2026-10-01'), buy('PETR4', 10, 110, '2026-10-05')],
        sales: [sale('PETR4', 10, 120, '2026-10-06')],
        today: '2026-10-06',
      }),
    )
    expect(l.lots.map((lot) => lot.quantity)).toEqual([5, 5])
    expect(l.events[0]).toMatchObject({ cost: 1050, gain: 150 })
  })

  it('renda fixa resgata da aplicação mais antiga, com IR pelos dias dela', () => {
    const asset = 'TESOURO SELIC 2029'
    const l = ledger(
      asset,
      input({
        buys: [buy(asset, 1, 100, '2026-01-01'), buy(asset, 1, 110, '2026-06-01')],
        sales: [sale(asset, 1, 120, '2026-10-01')],
        today: '2026-10-06',
      }),
    )
    // 273 dias: 20% de 20.
    expect(l.events[0]).toMatchObject({ bucket: 'renda_fixa', cost: 100, gain: 20 })
    expect(l.events[0].withheld).toBeCloseTo(4)
    expect(l.lots.map((lot) => lot.buy.price)).toEqual([110])
  })
})

describe('venda', () => {
  const base = input({ buys: [buy('PETR4', 100, 10, '2026-10-01')], today: '2026-10-06' })

  it('prévia: vender no dia da compra é day trade, 20% sem isenção', () => {
    const preview = previewSale(base, {
      asset: 'PETR4',
      quantity: 100,
      price: 11,
      sold_on: '2026-10-01',
    })
    expect(preview).toMatchObject({ dayTradeQty: 100, swingQty: 0, gain: 100, bucket: 'daytrade' })
    expect(preview.tax).toBeCloseTo(20)
  })

  it('não deixa vender mais do que tem, contando vendas depois', () => {
    expect(availableToSell(base, 'PETR4', '2026-09-30')).toBe(0)
    const sold = { ...base, sales: [sale('PETR4', 30, 12, '2026-10-05')] }
    expect(availableToSell(sold, 'PETR4', '2026-10-02')).toBe(70)
  })
})

describe('capitalTimeline', () => {
  it('vai da primeira compra até hoje, com carteira, investido e Selic', () => {
    const line = capitalTimeline(
      input({
        buys: [buy('PETR4', 10, 100, '2026-10-01')],
        quotes: [quote('PETR4', 120, '2026-10-05')],
        today: '2026-10-06',
      }),
    )
    expect(line.map((p) => p.day)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
    ])
    expect(line[0]).toMatchObject({ invested: 1000, value: 1000, selic: 1000 })
    expect(line[4].value).toBe(1200)
    expect(line[5].selic).toBeCloseTo(1000 * 1.01 ** 3)
  })

  it('depois da venda, o dinheiro vendido continua no capital', () => {
    const line = capitalTimeline(
      input({
        buys: [buy('PETR4', 10, 100, '2026-10-01')],
        sales: [sale('PETR4', 10, 110, '2026-10-02')],
        today: '2026-10-06',
      }),
    )
    expect(line[line.length - 1]).toMatchObject({ invested: 1000, value: 1100 })
    expect(line[line.length - 1].selic).toBeCloseTo(1010)
  })

  it('amostra históricos longos e termina sempre em hoje', () => {
    const line = capitalTimeline(
      input({ buys: [buy('X', 1, 10, '2020-01-01')], today: '2026-10-06' }),
      100,
    )
    expect(line.length).toBeLessThanOrEqual(101)
    expect(line[line.length - 1].day).toBe('2026-10-06')
  })
})

describe('prêmio de risco e maturação', () => {
  it('multiplicador: 1,5× a Selic rende 1,5% onde a Selic rende 1%', () => {
    expect(selicIndex(rates, 1.5).factor('2026-10-01', '2026-10-02')).toBeCloseTo(1.015)
  })

  it('menos de 30 dias na carteira: posição ainda maturando', () => {
    const buys = [buy('PETR4', 10, 100, '2026-10-01')]
    const young = portfolio(input({ buys, today: '2026-10-30' })).positions[0]
    const old = portfolio(input({ buys, today: '2026-10-31' })).positions[0]
    expect(young).toMatchObject({ heldSince: '2026-10-01', maturing: true })
    expect(old.maturing).toBe(false)
  })
})

describe('empate com a Selic e com a Selic + prêmio', () => {
  it('o empate com prêmio fica acima do empate com a Selic pura', () => {
    const buys = [buy('PETR4', 10, 100, '2026-10-01')]
    const [p] = portfolio(
      input({ buys, today: '2026-10-06', index: selicIndex(rates, 1.5), pureIndex: index }),
    ).positions
    expect(p.selicNetPure).toBeCloseTo(selicNet(1000, 1.01 ** 3, 5))
    expect(p.breakEvenPure).toBeCloseTo(p.selicNetPure / 10, 4)
    expect(p.breakEven).toBeGreaterThan(p.breakEvenPure)
  })

  it('sem prêmio, os dois empates são o mesmo', () => {
    const [p] = portfolio(
      input({ buys: [buy('PETR4', 10, 100, '2026-10-01')], today: '2026-10-06' }),
    ).positions
    expect(p.breakEvenPure).toBe(p.breakEven)
  })
})

describe('holdingTime', () => {
  it('anos, meses e dias, com o total de dias corridos', () => {
    expect(holdingTime('2025-08-23', '2026-10-28')).toEqual({
      label: '1 ano, 2 meses e 5 dias',
      totalDays: 431,
    })
    expect(holdingTime('2026-10-28', '2026-10-28').label).toBe('menos de 1 dia')
    expect(holdingTime('2026-10-27', '2026-10-28').label).toBe('1 dia')
  })
})

describe('parseDecimal', () => {
  it('ponto como milhar e vírgula como decimal', async () => {
    const { parseDecimal } = await import('./investActions')
    expect(parseDecimal('20.000')).toBe(20000)
    expect(parseDecimal('1.234,56')).toBe(1234.56)
    expect(parseDecimal('34.2')).toBe(34.2)
    expect(parseDecimal('0,005')).toBe(0.005)
  })
})

describe('sellSignals', () => {
  const buys = [buy('PETR4', 10, 100, '2026-08-01'), buy('VALE3', 10, 100, '2026-10-20')]
  const quotes = [quote('PETR4', 150, '2026-10-28'), quote('VALE3', 150, '2026-10-28')]
  const withPremium = { ...settings, selicMultiplier: 1.2 }

  it('só com prêmio, só quem bate a meta e já maturou', () => {
    const { positions } = portfolio(
      input({
        buys,
        quotes,
        today: '2026-10-28',
        index: selicIndex(rates, 1.2),
        settings: withPremium,
      }),
    )
    expect(sellSignals(positions, withPremium).map((p) => p.asset)).toEqual(['PETR4'])
    expect(sellSignals(positions, settings)).toEqual([])
  })
})
