import { addDays, differenceInCalendarDays, format, intervalToDuration, parseISO } from 'date-fns'
import {
  apurar,
  bucketOf,
  daysBetween,
  fixedIncomeNet,
  guessKind,
  type Apuracao,
  type AssetKind,
  type FinanceTaxSettings,
  type RealizedEvent,
} from './taxes'
import type { InvestmentBuy, InvestmentQuote, InvestmentSale } from './types'

/**
 * Investimentos contra a Selic.
 *
 * Cada compra e um "deposito" separado: o mesmo dinheiro, se tivesse ido para
 * a Selic no dia da compra, renderia a taxa diaria de cada dia util ate hoje.
 * A comparacao soma compra por compra — uma compra feita num dia ruim pesa so
 * o tamanho dela, sem contaminar as outras.
 *
 * E sempre liquido contra liquido: o ativo como se fosse vendido hoje, pago o
 * imposto do mes (com o que ja foi vendido e o prejuizo acumulado), contra a
 * Selic depois do IR regressivo de cada compra.
 *
 * Tudo puro: recebe as linhas, as taxas e o "hoje".
 */

/** Taxa Selic diaria por dia util (YYYY-MM-DD -> % ao dia, ex.: 0.050788). */
export type SelicRates = Record<string, number>

export const assetKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toUpperCase()

export const buyAmount = (buy: Pick<InvestmentBuy, 'quantity' | 'price'>) =>
  buy.quantity * buy.price

/* ------------------------------------------------------------ indice Selic */

/**
 * Indice acumulado: `at(dia)` = produto de (1 + taxa) de todos os dias uteis
 * ANTES do dia. O fator entre duas datas e a razao dos indices — a taxa do
 * dia da compra conta (o dinheiro dorme aplicado naquela noite), a de hoje
 * ainda nao.
 */
export interface SelicIndex {
  at: (day: string) => number
  factor: (from: string, to: string) => number
  /** Ultimo dia com taxa conhecida; null sem dados. */
  lastDay: string | null
  /** Selic anualizada (252 dias uteis) pela ultima taxa diaria, em %. */
  annual: number | null
}

/**
 * `multiplier` e o premio de risco: cada taxa diaria vezes ele (1,2 = 120% da
 * Selic), do mesmo jeito que um CDB paga "120% do CDI".
 */
export function selicIndex(rates: SelicRates, multiplier = 1): SelicIndex {
  const days = Object.keys(rates).sort()
  const rate = (day: string) => (rates[day] * multiplier) / 100
  // prefix[i] = produto das taxas de days[0..i-1]
  const prefix = [1]
  for (const day of days) prefix.push(prefix[prefix.length - 1] * (1 + rate(day)))

  const at = (day: string) => {
    // Quantos dias uteis estritamente antes de `day` (busca binaria).
    let lo = 0
    let hi = days.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (days[mid] < day) lo = mid + 1
      else hi = mid
    }
    return prefix[lo]
  }
  const last = days[days.length - 1] ?? null
  return {
    at,
    factor: (from, to) => (to <= from ? 1 : at(to) / at(from)),
    lastDay: last,
    annual: last ? ((1 + rate(last)) ** 252 - 1) * 100 : null,
  }
}

/* ---------------------------------------------------------------- precos */

/**
 * Preco do ativo num dia: a observacao mais recente ate ele. Compra e venda
 * tambem sao observacoes de mercado naquele dia; cotacao no mesmo dia vence.
 */
export function priceOn(
  asset: string,
  day: string,
  buys: InvestmentBuy[],
  quotes: InvestmentQuote[],
  sales: InvestmentSale[] = [],
): { price: number; day: string; fromQuote: boolean } | null {
  let best: { price: number; day: string; fromQuote: boolean } | null = null
  const trade = (price: number, on: string) => {
    if (on > day) return
    if (!best || on > best.day) best = { price, day: on, fromQuote: false }
  }
  for (const b of buys) if (b.asset === asset) trade(b.price, b.bought_on)
  for (const s of sales) if (s.asset === asset) trade(s.price, s.sold_on)
  for (const q of quotes) {
    if (q.asset !== asset || q.quoted_on > day) continue
    if (!best || q.quoted_on >= best.day)
      best = { price: q.price, day: q.quoted_on, fromQuote: true }
  }
  return best
}

/* ----------------------------------------------------------------- tipo */

/** Tipo do ativo: o da compra mais recente que diz; sem isso, o palpite pelo nome. */
export function kindOf(asset: string, buys: InvestmentBuy[]): AssetKind {
  let latest: InvestmentBuy | null = null
  for (const b of buys) {
    if (b.asset !== asset || !b.kind) continue
    if (!latest || `${b.bought_on}${b.created_at}` > `${latest.bought_on}${latest.created_at}`)
      latest = b
  }
  return latest?.kind ?? guessKind(asset) ?? 'acao'
}

/** Final 11 sem tipo informado: pode ser FII, ETF ou unit — a tela pede para confirmar. */
export const kindUnconfirmed = (asset: string, buys: InvestmentBuy[]) =>
  guessKind(asset) === null && !buys.some((b) => b.asset === asset && b.kind)

/* ---------------------------------------------------------------- razao */

/**
 * O que sobrou de uma compra. Na renda variavel a venda tira de todas as
 * compras na mesma proporcao (e isso que o preco medio faz); na renda fixa
 * tira das mais antigas primeiro (PEPS), porque cada aplicacao tem o seu prazo.
 */
export interface Lot {
  buy: InvestmentBuy
  quantity: number
}

/** Uma venda ja lida: quanto foi day trade, quanto foi swing, lucro e a Selic que ela encerrou. */
export interface SaleResult {
  sale: InvestmentSale
  dayTradeQty: number
  swingQty: number
  cost: number
  /** Lucro bruto (antes do imposto da apuracao mensal). */
  gain: number
  /** Renda fixa: IR + IOF retidos no resgate. */
  withheld: number
  /** O dinheiro dessas unidades, se tivesse ficado na Selic ate a venda (bruto e liquido de IR). */
  selicGross: number
  selicNet: number
}

export interface AssetLedger {
  asset: string
  kind: AssetKind
  lots: Lot[]
  quantity: number
  /** Custo do que ainda esta aberto. */
  cost: number
  sales: SaleResult[]
  events: RealizedEvent[]
}

const EPS = 1e-9

/**
 * Posicao com menos que isso na carteira ainda nao maturou: a rentabilidade
 * oscila demais para decidir algo — a tela mostra so a direcao.
 */
export const MATURITY_DAYS = 30
const sum = <T>(list: T[], of: (item: T) => number) => list.reduce((s, item) => s + of(item), 0)

export interface PortfolioInput {
  buys: InvestmentBuy[]
  sales: InvestmentSale[]
  quotes: InvestmentQuote[]
  /** A meta: Selic vezes o premio de risco (igual a Selic pura sem premio). */
  index: SelicIndex
  /** A Selic pura, para o empate sem premio. Ausente = a mesma do `index`. */
  pureIndex?: SelicIndex
  today: string
  settings: FinanceTaxSettings
}

/** O mesmo dinheiro na Selic de `from` ate `to`: bruto e depois do IR/IOF da renda fixa. */
function shadow(
  amount: number,
  from: string,
  to: string,
  input: PortfolioInput,
  index = input.index,
) {
  const gross = amount * index.factor(from, to)
  const net = amount + fixedIncomeNet(gross - amount, daysBetween(from, to), input.settings).net
  return { gross, net }
}

/**
 * Passa as compras e vendas de um ativo dia a dia ate `until`. Compra e venda
 * do mesmo ativo no mesmo dia sao day trade (casadas primeiro, pelos precos
 * medios do dia); o resto da venda sai da posicao que ja existia — swing.
 * Renda fixa nao tem day trade: cada resgate sai das aplicacoes mais antigas.
 */
export function ledger(asset: string, input: PortfolioInput, until = input.today): AssetLedger {
  const kind = kindOf(asset, input.buys)
  const own = input.buys.filter((b) => b.asset === asset && b.bought_on <= until)
  const sold = input.sales.filter((s) => s.asset === asset && s.sold_on <= until)
  const days = [...new Set([...own.map((b) => b.bought_on), ...sold.map((s) => s.sold_on)])].sort()
  let lots: Lot[] = []
  const results: SaleResult[] = []
  const events: RealizedEvent[] = []
  const held = () => sum(lots, (l) => l.quantity)

  for (const day of days) {
    const dayBuys = own.filter((b) => b.bought_on === day)
    const daySales = sold.filter((s) => s.sold_on === day)

    if (kind === 'renda_fixa') {
      for (const b of dayBuys) lots.push({ buy: b, quantity: b.quantity })
      for (const s of daySales) {
        let remaining = Math.min(s.quantity, held())
        const r: SaleResult = {
          sale: s,
          dayTradeQty: 0,
          swingQty: remaining,
          cost: 0,
          gain: 0,
          withheld: 0,
          selicGross: 0,
          selicNet: 0,
        }
        while (remaining > EPS && lots.length > 0) {
          const lot = lots[0]
          const part = Math.min(lot.quantity, remaining)
          const amount = part * lot.buy.price
          const gain = part * s.price - amount
          const fx = fixedIncomeNet(gain, daysBetween(lot.buy.bought_on, day), input.settings)
          const sh = shadow(amount, lot.buy.bought_on, day, input)
          r.cost += amount
          r.gain += gain
          r.withheld += fx.iof + fx.ir
          r.selicGross += sh.gross
          r.selicNet += sh.net
          lot.quantity -= part
          remaining -= part
          if (lot.quantity <= EPS) lots.shift()
        }
        results.push(r)
        if (r.swingQty > EPS)
          events.push({
            asset,
            kind,
            date: day,
            bucket: 'renda_fixa',
            saleValue: r.swingQty * s.price,
            cost: r.cost,
            gain: r.gain,
            withheld: r.withheld,
          })
      }
      continue
    }

    const bought = sum(dayBuys, (b) => b.quantity)
    const soldQty = sum(daySales, (s) => s.quantity)
    const dt = Math.min(bought, soldQty)
    const buyAvg = bought > 0 ? sum(dayBuys, buyAmount) / bought : 0
    const saleAvg = soldQty > 0 ? sum(daySales, (s) => s.quantity * s.price) / soldQty : 0

    // Swing: sai da posicao de antes do dia, igual em todas as compras.
    const swing = Math.min(soldQty - dt, held())
    let swingCost = 0
    let selicGross = 0
    let selicNet = 0
    if (swing > EPS) {
      const ratio = swing / held()
      for (const lot of lots) {
        const part = lot.quantity * ratio
        const amount = part * lot.buy.price
        const sh = shadow(amount, lot.buy.bought_on, day, input)
        swingCost += amount
        selicGross += sh.gross
        selicNet += sh.net
        lot.quantity -= part
      }
      lots = lots.filter((l) => l.quantity > EPS)
    }
    // O que nao foi day trade fica na carteira.
    if (bought - dt > EPS)
      for (const b of dayBuys) lots.push({ buy: b, quantity: b.quantity * (1 - dt / bought) })

    if (dt > EPS)
      events.push({
        asset,
        kind,
        date: day,
        bucket: bucketOf(kind, true),
        saleValue: dt * saleAvg,
        cost: dt * buyAvg,
        gain: dt * (saleAvg - buyAvg),
        withheld: 0,
      })
    if (swing > EPS)
      events.push({
        asset,
        kind,
        date: day,
        bucket: bucketOf(kind, false),
        saleValue: swing * saleAvg,
        cost: swingCost,
        gain: swing * saleAvg - swingCost,
        withheld: 0,
      })

    const avgCost = swing > EPS ? swingCost / swing : 0
    for (const s of daySales) {
      const share = s.quantity / soldQty
      const dq = dt * share
      const sq = swing * share
      results.push({
        sale: s,
        dayTradeQty: dq,
        swingQty: sq,
        cost: dq * buyAvg + sq * avgCost,
        gain: dq * (s.price - buyAvg) + sq * (s.price - avgCost),
        withheld: 0,
        // Day trade: o dinheiro entra e sai no mesmo dia, sem Selic.
        selicGross: dq * buyAvg + selicGross * share,
        selicNet: dq * buyAvg + selicNet * share,
      })
    }
  }

  return {
    asset,
    kind,
    lots,
    quantity: held(),
    cost: sum(lots, (l) => l.quantity * l.buy.price),
    sales: results,
    events,
  }
}

const assetsOf = (input: PortfolioInput) => [...new Set(input.buys.map((b) => b.asset))]

/** Todas as vendas ja feitas, prontas para a apuracao. */
export const realizedEvents = (input: PortfolioInput, until = input.today) =>
  assetsOf(input).flatMap((asset) => ledger(asset, input, until).events)

const totalTax = (a: Apuracao) => sum(a.months, (m) => m.tax)

/**
 * Quanto de imposto a mais as vendas `extra` geram, somadas ao que ja foi
 * vendido: usa o total vendido no mes (isencao) e o prejuizo acumulado.
 * Renda fixa entra pelo retido na fonte.
 */
function extraTax(
  base: RealizedEvent[],
  baseTax: number,
  extra: RealizedEvent[],
  input: PortfolioInput,
) {
  const variable = extra.filter((e) => e.bucket !== 'renda_fixa')
  const withheld = sum(extra, (e) => e.withheld)
  if (variable.length === 0) return withheld
  return totalTax(apurar([...base, ...variable], input.settings)) - baseTax + withheld
}

/** A venda de toda a posicao a `price` em `day` (sempre swing). */
function sellAll(l: AssetLedger, price: number, day: string, input: PortfolioInput): RealizedEvent {
  const saleValue = l.quantity * price
  const withheld =
    l.kind === 'renda_fixa'
      ? sum(l.lots, (lot) => {
          const fx = fixedIncomeNet(
            lot.quantity * (price - lot.buy.price),
            daysBetween(lot.buy.bought_on, day),
            input.settings,
          )
          return fx.iof + fx.ir
        })
      : 0
  return {
    asset: l.asset,
    kind: l.kind,
    date: day,
    bucket: bucketOf(l.kind, false),
    saleValue,
    cost: l.cost,
    gain: saleValue - l.cost,
    withheld,
  }
}

/* -------------------------------------------------------------- posicoes */

/** Uma compra (o que sobrou dela) contra a Selic, as duas ja liquidas de imposto. */
export interface BuyResult {
  buy: InvestmentBuy
  /** Unidades que ainda restam desta compra. */
  quantity: number
  amount: number
  value: number
  /** Parte do imposto se vendesse hoje (renda variavel: igual por unidade, pelo preco medio). */
  tax: number
  netValue: number
  selicValue: number
  selicNet: number
  /** Retorno liquido do ativo e da Selic no mesmo periodo, em %. */
  returnPct: number
  selicPct: number
  beat: boolean
}

export interface Position {
  asset: string
  kind: AssetKind
  quantity: number
  invested: number
  avgPrice: number
  price: number
  priceDay: string
  /** O preco atual veio de uma cotacao (e nao so de uma compra ou venda). */
  quoted: boolean
  value: number
  /** Lucro bruto, antes do imposto. */
  result: number
  /** Imposto se vendesse tudo hoje, somado ao que ja foi vendido no mes. */
  taxIfSold: number
  netValue: number
  netResult: number
  /** Retorno liquido (depois do imposto), em %. */
  returnPct: number
  grossReturnPct: number
  selicValue: number
  /** A Selic depois do IR regressivo de cada compra. */
  selicNet: number
  selicPct: number
  /** Liquido contra liquido: acima (+) ou abaixo (-) da Selic. */
  vsSelic: number
  beat: boolean
  /**
   * Preco que o ativo precisa ter HOJE para, vendido e pago o imposto,
   * empatar com a Selic liquida de cada compra.
   */
  breakEven: number
  /** A Selic pura liquida (sem o premio de risco). */
  selicNetPure: number
  /** Preco de empate com a Selic pura: acima dele, saiu do zero a zero. */
  breakEvenPure: number
  /** Desde quando a parte mais antiga da posicao esta na carteira. */
  heldSince: string
  /** Menos de MATURITY_DAYS na carteira: rentabilidade ainda imprecisa. */
  maturing: boolean
  /** Vendas de acoes no mes se vendesse esta posicao hoje (decide a isencao). */
  stockSalesIfSold: number
  buys: BuyResult[]
  ledger: AssetLedger
}

export interface Contribution {
  asset: string
  vsSelic: number
  /** Peso na carteira (0..1); null para as vendas ja feitas. */
  weight: number | null
}

export interface RealizedSummary {
  proceeds: number
  cost: number
  gain: number
  /** Imposto da apuracao mensal + retido na renda fixa. */
  tax: number
  net: number
  /** Ganho liquido que a Selic teria dado no mesmo dinheiro, ate cada venda. */
  selicNet: number
  vsSelic: number
}

export interface PortfolioSummary {
  invested: number
  value: number
  result: number
  /** Imposto se vendesse a carteira inteira hoje (uma venda so: isencao vale para o total). */
  taxIfSold: number
  netValue: number
  returnPct: number
  grossReturnPct: number
  selicValue: number
  selicNet: number
  selicPct: number
  /** Liquido contra liquido, posicao aberta + vendas ja feitas. */
  vsSelic: number
  beat: boolean
  buysBeating: number
  buysTotal: number
  month: {
    month: string
    stockSales: number
    stockSalesIfAll: number
    limit: number
  }
  realized: RealizedSummary | null
  contributions: Contribution[]
}

export interface Portfolio {
  positions: Position[]
  summary: PortfolioSummary
  ledgers: AssetLedger[]
  apuracao: Apuracao
  events: RealizedEvent[]
}

const pct = (value: number, base: number) => (base > 0 ? (value / base - 1) * 100 : 0)

/** Menor preco em que `netAt` alcanca `target` (busca binaria). */
function solvePrice(netAt: (price: number) => number, target: number, hint: number): number {
  let lo = 0
  let hi = Math.max(hint, 0.01) * 2
  while (netAt(hi) < target && hi < 1e12) hi *= 2
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (netAt(mid) >= target) hi = mid
    else lo = mid
  }
  return hi
}

export function portfolio(input: PortfolioInput): Portfolio {
  const { today, settings } = input
  const month = today.slice(0, 7)
  const ledgers = assetsOf(input).map((asset) => ledger(asset, input))
  const events = ledgers.flatMap((l) => l.events)
  const apuracao = apurar(events, settings)
  const baseTax = totalTax(apuracao)
  const stockSales = apuracao.months.find((m) => m.month === month)?.stockSales ?? 0

  const list: Position[] = []
  for (const l of ledgers) {
    if (l.quantity <= EPS) continue
    const current = priceOn(l.asset, today, input.buys, input.quotes, input.sales)!
    const value = l.quantity * current.price
    const taxAt = (price: number) =>
      extraTax(events, baseTax, [sellAll(l, price, today, input)], input)
    const taxIfSold = taxAt(current.price)
    const netValue = value - taxIfSold

    const buys: BuyResult[] = l.lots.map((lot) => {
      const amount = lot.quantity * lot.buy.price
      const lotValue = lot.quantity * current.price
      const sh = shadow(amount, lot.buy.bought_on, today, input)
      let tax = taxIfSold * (lot.quantity / l.quantity)
      if (l.kind === 'renda_fixa') {
        const fx = fixedIncomeNet(
          lotValue - amount,
          daysBetween(lot.buy.bought_on, today),
          settings,
        )
        tax = fx.iof + fx.ir
      }
      return {
        buy: lot.buy,
        quantity: lot.quantity,
        amount,
        value: lotValue,
        tax,
        netValue: lotValue - tax,
        selicValue: sh.gross,
        selicNet: sh.net,
        returnPct: pct(lotValue - tax, amount),
        selicPct: pct(sh.net, amount),
        beat: lotValue - tax >= sh.net,
      }
    })
    const selicValue = sum(buys, (b) => b.selicValue)
    const selicNet = sum(buys, (b) => b.selicNet)
    const selicNetPure = input.pureIndex
      ? sum(
          l.lots,
          (lot) =>
            shadow(lot.quantity * lot.buy.price, lot.buy.bought_on, today, input, input.pureIndex)
              .net,
        )
      : selicNet
    const heldSince = l.lots.reduce(
      (min, lot) => (lot.buy.bought_on < min ? lot.buy.bought_on : min),
      today,
    )
    list.push({
      asset: l.asset,
      kind: l.kind,
      quantity: l.quantity,
      invested: l.cost,
      avgPrice: l.cost / l.quantity,
      price: current.price,
      priceDay: current.day,
      quoted: current.fromQuote,
      value,
      result: value - l.cost,
      taxIfSold,
      netValue,
      netResult: netValue - l.cost,
      returnPct: pct(netValue, l.cost),
      grossReturnPct: pct(value, l.cost),
      selicValue,
      selicNet,
      selicPct: pct(selicNet, l.cost),
      vsSelic: netValue - selicNet,
      beat: netValue >= selicNet,
      breakEven: solvePrice((price) => l.quantity * price - taxAt(price), selicNet, current.price),
      selicNetPure,
      breakEvenPure:
        selicNetPure === selicNet
          ? solvePrice((price) => l.quantity * price - taxAt(price), selicNet, current.price)
          : solvePrice((price) => l.quantity * price - taxAt(price), selicNetPure, current.price),
      heldSince,
      maturing: daysBetween(heldSince, today) < MATURITY_DAYS,
      stockSalesIfSold: stockSales + (l.kind === 'acao' ? value : 0),
      buys,
      ledger: l,
    })
  }
  list.sort((a, b) => b.value - a.value)

  // A carteira inteira vendida hoje: o imposto e um so (a isencao olha o total
  // vendido de acoes), dividido entre os ativos com lucro.
  const hypo = list.map((p) => sellAll(p.ledger, p.price, today, input))
  const taxIfSold = extraTax(events, baseTax, hypo, input)
  const variableTax = taxIfSold - sum(hypo, (e) => e.withheld)
  const winners = sum(
    list.filter((p) => p.kind !== 'renda_fixa'),
    (p) => Math.max(0, p.result),
  )
  const allocated = (p: Position) =>
    p.kind === 'renda_fixa'
      ? p.taxIfSold
      : winners > 0
        ? variableTax * (Math.max(0, p.result) / winners)
        : 0

  const sales = ledgers.flatMap((l) => l.sales)
  let realized: RealizedSummary | null = null
  if (sales.length > 0) {
    const cost = sum(events, (e) => e.cost)
    const gain = sum(events, (e) => e.gain)
    const tax = baseTax + sum(events, (e) => e.withheld)
    const selicNet = sum(sales, (s) => s.selicNet) - sum(sales, (s) => s.cost)
    realized = {
      proceeds: sum(events, (e) => e.saleValue),
      cost,
      gain,
      tax,
      net: gain - tax,
      selicNet,
      vsSelic: gain - tax - selicNet,
    }
  }

  const invested = sum(list, (p) => p.invested)
  const value = sum(list, (p) => p.value)
  const selicValue = sum(list, (p) => p.selicValue)
  const selicNet = sum(list, (p) => p.selicNet)
  const netValue = value - taxIfSold
  const vsSelic = netValue - selicNet + (realized?.vsSelic ?? 0)
  const allBuys = list.flatMap((p) => p.buys)
  const contributions: Contribution[] = list.map((p) => ({
    asset: p.asset,
    vsSelic: p.value - allocated(p) - p.selicNet,
    weight: value > 0 ? p.value / value : 0,
  }))
  if (realized)
    contributions.push({ asset: 'Vendas feitas', vsSelic: realized.vsSelic, weight: null })

  return {
    positions: list,
    ledgers,
    apuracao,
    events,
    summary: {
      invested,
      value,
      result: value - invested,
      taxIfSold,
      netValue,
      returnPct: pct(netValue, invested),
      grossReturnPct: pct(value, invested),
      selicValue,
      selicNet,
      selicPct: pct(selicNet, invested),
      vsSelic,
      beat: vsSelic >= 0,
      buysBeating: allBuys.filter((b) => b.beat).length,
      buysTotal: allBuys.length,
      month: {
        month,
        stockSales,
        stockSalesIfAll:
          stockSales +
          sum(
            hypo.filter((e) => e.kind === 'acao'),
            (e) => e.saleValue,
          ),
        limit: settings.stockExemptionLimit,
      },
      realized,
      contributions,
    },
  }
}

/** Tempo na operacao: "1 ano, 2 meses e 5 dias" e o total de dias corridos. */
export function holdingTime(since: string, today: string): { label: string; totalDays: number } {
  const d = intervalToDuration({ start: parseISO(since), end: parseISO(today) })
  const parts = (
    [
      [d.years ?? 0, 'ano', 'anos'],
      [d.months ?? 0, 'mês', 'meses'],
      [d.days ?? 0, 'dia', 'dias'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
  const label =
    parts.length === 0
      ? 'menos de 1 dia'
      : parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
  return { label, totalDays: daysBetween(since, today) }
}

/**
 * Sinais de venda: posicoes que, vendidas hoje e pagas o imposto, rendem pelo
 * menos a Selic + premio. So com premio configurado (sem ele nao ha meta acima
 * da Selic) e sem as que ainda nao maturaram — nada de decidir no susto.
 * As que mais passaram da meta vem primeiro.
 */
export function sellSignals(list: Position[], settings: FinanceTaxSettings): Position[] {
  if (settings.selicMultiplier === 1) return []
  return list.filter((p) => p.beat && !p.maturing).sort((a, b) => b.vsSelic - a.vsSelic)
}

/* ---------------------------------------------------------------- venda */

/** Quantas unidades da para vender em `day`: o que havia, mais as compras do dia. */
export function availableToSell(input: PortfolioInput, asset: string, day: string): number {
  const l = ledger(asset, input, day)
  const later = input.sales.filter((s) => s.asset === asset && s.sold_on > day)
  return Math.max(0, l.quantity - sum(later, (s) => s.quantity))
}

export interface SalePreview {
  dayTradeQty: number
  swingQty: number
  saleValue: number
  gain: number
  /** Imposto a mais que esta venda gera (o mes inteiro recalculado). */
  tax: number
  net: number
  bucket: RealizedEvent['bucket']
  /** Vendas de acoes no mes, ja contando esta. */
  stockSales: number
  exempt: boolean
}

/** O que acontece se esta venda for registrada: day trade ou swing, lucro e imposto real. */
export function previewSale(
  input: PortfolioInput,
  draft: { asset: string; quantity: number; price: number; sold_on: string },
): SalePreview {
  const fake: InvestmentSale = {
    id: '__preview__',
    user_id: null,
    asset: draft.asset,
    quantity: draft.quantity,
    price: draft.price,
    sold_on: draft.sold_on,
    deleted: false,
    created_at: '9999-12-31T23:59:59.999Z',
    updated_at: '9999-12-31T23:59:59.999Z',
  }
  const before = realizedEvents(input, '9999-12-31')
  const withSale = { ...input, sales: [...input.sales, fake] }
  const after = realizedEvents(withSale, '9999-12-31')
  const r = ledger(draft.asset, withSale, '9999-12-31').sales.find((s) => s.sale.id === fake.id)!
  const kind = kindOf(draft.asset, input.buys)
  const a = apurar(after, input.settings)
  const variableTax = totalTax(a) - totalTax(apurar(before, input.settings))
  const tax = variableTax + r.withheld
  const stockSales = a.months.find((m) => m.month === draft.sold_on.slice(0, 7))?.stockSales ?? 0
  return {
    dayTradeQty: r.dayTradeQty,
    swingQty: r.swingQty,
    saleValue: (r.dayTradeQty + r.swingQty) * draft.price,
    gain: r.gain,
    tax,
    net: r.gain - tax,
    bucket: bucketOf(kind, r.dayTradeQty > EPS && r.swingQty <= EPS),
    stockSales,
    exempt: stockSales <= input.settings.stockExemptionLimit,
  }
}

/* ------------------------------------------------------- linha do tempo */

export interface CapitalPoint {
  day: string
  /** Dinheiro colocado ate o dia (todas as compras). */
  invested: number
  /** Carteira a preco de mercado + o dinheiro das vendas ja feitas. */
  value: number
  /** O mesmo dinheiro, cada compra rendendo a meta (Selic x premio) desde a sua data (bruto). */
  selic: number
  /** O mesmo, na Selic pura — so existe quando ha premio de risco. */
  selicPure?: number
  /** Quanto foi comprado neste dia (0 = nenhuma compra): vira marca no grafico. */
  bought: number
}

/**
 * Capital dia a dia, da primeira compra ate hoje, em valores brutos. Historico
 * longo e amostrado (no maximo ~`maxPoints` pontos), sempre terminando em hoje.
 */
export function capitalTimeline(input: PortfolioInput, maxPoints = 240): CapitalPoint[] {
  const { today } = input
  const active = input.buys.filter((b) => b.bought_on <= today)
  if (active.length === 0) return []
  const first = active.reduce((min, b) => (b.bought_on < min ? b.bought_on : min), today)
  const span = differenceInCalendarDays(parseISO(today), parseISO(first))
  const step = Math.max(1, Math.ceil((span + 1) / maxPoints))
  const assets = assetsOf(input)

  const sampled = new Set<string>(active.map((b) => b.bought_on))
  for (let i = 0; i <= span; i += step)
    sampled.add(format(addDays(parseISO(first), i), 'yyyy-MM-dd'))
  sampled.add(today)
  // Os dias de compra entram sempre: a marca cai no dia certo.
  const days = [...sampled].sort()
  const pureInput = input.pureIndex ? { ...input, index: input.pureIndex } : null

  return days.map((day) => {
    let value = 0
    let selic = 0
    let selicPure = 0
    for (const asset of assets) {
      if (pureInput) {
        const pure = ledger(asset, pureInput, day)
        for (const lot of pure.lots)
          selicPure += lot.quantity * lot.buy.price * pureInput.index.factor(lot.buy.bought_on, day)
        for (const s of pure.sales) selicPure += s.selicGross
      }
      const l = ledger(asset, input, day)
      if (l.quantity > EPS)
        value +=
          l.quantity * (priceOn(asset, day, input.buys, input.quotes, input.sales)?.price ?? 0)
      for (const lot of l.lots)
        selic += lot.quantity * lot.buy.price * input.index.factor(lot.buy.bought_on, day)
      for (const s of l.sales) {
        value += (s.dayTradeQty + s.swingQty) * s.sale.price
        selic += s.selicGross
      }
    }
    return {
      day,
      invested: sum(
        active.filter((b) => b.bought_on <= day),
        buyAmount,
      ),
      value,
      selic,
      ...(pureInput ? { selicPure } : {}),
      bought: sum(
        active.filter((b) => b.bought_on === day),
        buyAmount,
      ),
    }
  })
}

/* ------------------------------------------------------------ formatacao */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatBRL = (value: number) => BRL.format(value)

/** Sinal sempre visivel: o "+" e informacao, nao enfeite. */
export const formatSignedBRL = (value: number) =>
  `${value >= 0 ? '+' : '−'}${BRL.format(Math.abs(value))}`

export const formatPct = (value: number, digits = 2) =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`

/** Eixo do grafico: "R$ 12,3 mil" cabe onde "R$ 12.345,00" nao cabe. */
export const formatBRLShort = (value: number) =>
  Math.abs(value) >= 1000
    ? `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
    : `R$ ${Math.round(value)}`

export const formatQuantity = (value: number) =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 8 })
