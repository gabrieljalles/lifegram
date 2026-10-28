import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  subDays,
} from 'date-fns'

/**
 * Impostos sobre investimentos — para comparar liquido com liquido.
 *
 * Renda fixa (Tesouro, CDB): IR regressivo pelos dias de cada aplicacao, mais
 * IOF nos primeiros 30 dias; retido na fonte, sem DARF.
 *
 * Renda variavel: apuracao mensal em tres caixas que NAO se misturam —
 * operacoes comuns (acoes, ETF, BDR), day trade e FII. Cada caixa tem o seu
 * saldo de prejuizo, que nao vence e so abate lucro tributavel da mesma caixa.
 * Acoes no swing sao isentas no mes em que o total VENDIDO de acoes fica ate o
 * limite (R$ 20 mil); lucro isento nao consome prejuizo, prejuizo de mes
 * isento entra no saldo. ETF e BDR nao tem isencao; FII paga 20% sempre.
 *
 * Os numeros vem das configuracoes (a engrenagem do Financeiro): se a lei
 * mudar, ajusta-se la, sem codigo novo.
 */

export interface FixedIncomeBracket {
  /** Ate quantos dias (inclusive) vale a aliquota; null = dali em diante. */
  upToDays: number | null
  rate: number
}

export interface FinanceTaxSettings {
  fixedIncome: FixedIncomeBracket[]
  /** Operacoes comuns: acoes (fora da isencao), ETF e BDR. */
  swingRate: number
  dayTradeRate: number
  fiiRate: number
  /** Total vendido de ACOES no mes ate este valor: lucro de acoes isento. */
  stockExemptionLimit: number
  /** "Dedo-duro": % do valor vendido retido nas vendas comuns e de FII. */
  irrfSwingPct: number
  /** % do lucro de day trade retido pela corretora. */
  irrfDayTradePct: number
  /** DARF abaixo disso nao se paga: acumula para o mes seguinte. */
  darfMinimum: number
  /**
   * Premio de risco: a meta e esta fracao da Selic (1,2 = 120% da Selic, como
   * se diz "120% do CDI"). 1 = a propria Selic.
   */
  selicMultiplier: number
}

export const DEFAULT_TAX_SETTINGS: FinanceTaxSettings = {
  fixedIncome: [
    { upToDays: 180, rate: 22.5 },
    { upToDays: 360, rate: 20 },
    { upToDays: 720, rate: 17.5 },
    { upToDays: null, rate: 15 },
  ],
  swingRate: 15,
  dayTradeRate: 20,
  fiiRate: 20,
  stockExemptionLimit: 20000,
  irrfSwingPct: 0.005,
  irrfDayTradePct: 1,
  darfMinimum: 10,
  selicMultiplier: 1,
}

/** Tabela oficial do IOF regressivo (% do rendimento) pelo dia do resgate, 1 a 29. */
const IOF_TABLE = [
  96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20,
  16, 13, 10, 6, 3,
]

export const iofRate = (days: number): number => (days >= 1 && days < 30 ? IOF_TABLE[days - 1] : 0)

export function fixedIncomeRate(days: number, settings: FinanceTaxSettings): number {
  const sorted = [...settings.fixedIncome].sort(
    (a, b) => (a.upToDays ?? Infinity) - (b.upToDays ?? Infinity),
  )
  for (const bracket of sorted)
    if (bracket.upToDays === null || days <= bracket.upToDays) return bracket.rate
  return sorted[sorted.length - 1]?.rate ?? 0
}

/**
 * Ganho liquido de renda fixa resgatada apos `days` dias: tira o IOF (se
 * antes de 30 dias) e o IR da faixa. Prejuizo nao paga imposto.
 */
export function fixedIncomeNet(gross: number, days: number, settings: FinanceTaxSettings) {
  if (gross <= 0) return { net: gross, iof: 0, ir: 0, rate: fixedIncomeRate(days, settings) }
  const iof = gross * (iofRate(days) / 100)
  const rate = fixedIncomeRate(days, settings)
  const ir = (gross - iof) * (rate / 100)
  return { net: gross - iof - ir, iof, ir, rate }
}

export const daysBetween = (from: string, to: string) =>
  Math.max(0, differenceInCalendarDays(parseISO(to), parseISO(from)))

/* ---------------------------------------------------- apuracao mensal */

export type AssetKind = 'acao' | 'fii' | 'etf' | 'bdr' | 'renda_fixa'
export type TaxBucket = 'comum' | 'daytrade' | 'fii'

/** Uma venda (ou parte dela) ja com o lucro calculado — a materia-prima da apuracao. */
export interface RealizedEvent {
  asset: string
  kind: AssetKind
  date: string
  /** Renda fixa nao entra na apuracao: o imposto ja sai retido. */
  bucket: TaxBucket | 'renda_fixa'
  saleValue: number
  cost: number
  gain: number
  /** IR + IOF retidos na fonte (renda fixa). */
  withheld: number
}

export interface BucketMonth {
  result: number
  lossBefore: number
  lossUsed: number
  lossAfter: number
  taxable: number
  rate: number
  tax: number
}

export interface MonthTax {
  month: string
  /** Total vendido de acoes no swing: decide a isencao. */
  stockSales: number
  exempt: boolean
  /** Lucro de acoes que ficou isento neste mes. */
  exemptGain: number
  comum: BucketMonth
  daytrade: BucketMonth
  fii: BucketMonth
  /** Soma do imposto das tres caixas, antes de descontar a retencao. */
  tax: number
  /** Retido na fonte neste mes (dedo-duro + 1% do day trade). */
  irrf: number
  /** Retencao de meses anteriores ainda nao aproveitada, usada aqui. */
  irrfCreditUsed: number
  /** DARF abaixo do minimo vindo dos meses anteriores. */
  carriedIn: number
  /** O que vai na DARF deste mes (0 se ficou abaixo do minimo). */
  darf: number
  /** Valor abaixo do minimo que passa para o mes seguinte. */
  carriedOut: number
  dueDate: string
  /** IR + IOF ja retidos em resgates de renda fixa. */
  fixedIncomeWithheld: number
  events: RealizedEvent[]
}

export interface Apuracao {
  months: MonthTax[]
  /** Saldos de prejuizo acumulado ao fim, por caixa. */
  losses: Record<TaxBucket, number>
  irrfCredit: number
}

/** Ultimo dia util (seg-sex) do mes seguinte: vencimento da DARF. Feriado nao entra na conta. */
export function darfDueDate(month: string): string {
  let day = endOfMonth(addMonths(parseISO(`${month}-01`), 1))
  while (day.getDay() === 0 || day.getDay() === 6) day = subDays(day, 1)
  return format(day, 'yyyy-MM-dd')
}

const emptyBucket = (): BucketMonth => ({
  result: 0,
  lossBefore: 0,
  lossUsed: 0,
  lossAfter: 0,
  taxable: 0,
  rate: 0,
  tax: 0,
})

function closeBucket(result: number, loss: number, rate: number): BucketMonth {
  const lossUsed = result > 0 ? Math.min(loss, result) : 0
  const taxable = result > 0 ? result - lossUsed : 0
  const lossAfter = result > 0 ? loss - lossUsed : loss - result
  return {
    result,
    lossBefore: loss,
    lossUsed,
    lossAfter,
    taxable,
    rate,
    tax: taxable * (rate / 100),
  }
}

export function apurar(events: RealizedEvent[], settings: FinanceTaxSettings): Apuracao {
  const byMonth = new Map<string, RealizedEvent[]>()
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
    const month = e.date.slice(0, 7)
    byMonth.set(month, [...(byMonth.get(month) ?? []), e])
  }

  const losses: Record<TaxBucket, number> = { comum: 0, daytrade: 0, fii: 0 }
  let irrfCredit = 0
  let carried = 0
  const months: MonthTax[] = []

  for (const [month, list] of [...byMonth].sort(([a], [b]) => a.localeCompare(b))) {
    const comumEvents = list.filter((e) => e.bucket === 'comum')
    const stockSales = comumEvents
      .filter((e) => e.kind === 'acao')
      .reduce((s, e) => s + e.saleValue, 0)
    const exempt = stockSales <= settings.stockExemptionLimit
    let exemptGain = 0
    let comumResult = 0
    for (const e of comumEvents) {
      // Lucro de acao em mes isento fica de fora; prejuizo sempre entra.
      if (e.kind === 'acao' && exempt && e.gain > 0) exemptGain += e.gain
      else comumResult += e.gain
    }
    const dtResult = list.filter((e) => e.bucket === 'daytrade').reduce((s, e) => s + e.gain, 0)
    const fiiResult = list.filter((e) => e.bucket === 'fii').reduce((s, e) => s + e.gain, 0)

    const comum = comumEvents.length
      ? closeBucket(comumResult, losses.comum, settings.swingRate)
      : { ...emptyBucket(), lossBefore: losses.comum, lossAfter: losses.comum }
    const hasDt = list.some((e) => e.bucket === 'daytrade')
    const daytrade = hasDt
      ? closeBucket(dtResult, losses.daytrade, settings.dayTradeRate)
      : { ...emptyBucket(), lossBefore: losses.daytrade, lossAfter: losses.daytrade }
    const hasFii = list.some((e) => e.bucket === 'fii')
    const fii = hasFii
      ? closeBucket(fiiResult, losses.fii, settings.fiiRate)
      : { ...emptyBucket(), lossBefore: losses.fii, lossAfter: losses.fii }
    losses.comum = comum.lossAfter
    losses.daytrade = daytrade.lossAfter
    losses.fii = fii.lossAfter

    // Dedo-duro por venda; retencao de ate R$ 1,00 e dispensada (na pratica,
    // venda de ate R$ 20 mil nao retem nada).
    const dedoDuro = list
      .filter((e) => e.bucket === 'comum' || e.bucket === 'fii')
      .map((e) => e.saleValue * (settings.irrfSwingPct / 100))
      .filter((value) => value > 1)
      .reduce((s, value) => s + value, 0)
    const irrf = dedoDuro + Math.max(0, dtResult) * (settings.irrfDayTradePct / 100)

    const tax = comum.tax + daytrade.tax + fii.tax
    const credit = irrfCredit + irrf
    const irrfUsed = Math.min(credit, tax)
    irrfCredit = credit - irrfUsed
    const owed = tax - irrfUsed + carried
    const darf = owed >= settings.darfMinimum ? owed : 0
    const carriedOut = owed >= settings.darfMinimum ? 0 : owed

    months.push({
      month,
      stockSales,
      exempt,
      exemptGain,
      comum,
      daytrade,
      fii,
      tax,
      irrf,
      irrfCreditUsed: Math.max(0, irrfUsed - irrf),
      carriedIn: carried,
      darf,
      carriedOut,
      dueDate: darfDueDate(month),
      fixedIncomeWithheld: list
        .filter((e) => e.bucket === 'renda_fixa')
        .reduce((s, e) => s + e.withheld, 0),
      events: list,
    })
    carried = carriedOut
  }

  return { months, losses, irrfCredit }
}

/** Imposto da caixa no mes (antes da retencao), para comparar cenarios. */
export const monthTaxOf = (apuracao: Apuracao, month: string): number =>
  apuracao.months.find((m) => m.month === month)?.tax ?? 0

/* ------------------------------------------------------------- tipos */

export const KIND_LABEL: Record<AssetKind, string> = {
  acao: 'Ação',
  fii: 'FII',
  etf: 'ETF',
  bdr: 'BDR',
  renda_fixa: 'Renda fixa',
}

/**
 * Palpite do tipo pelo nome. Final 11 e ambiguo (FII, ETF ou unit de acao),
 * entao volta null e o formulario pede para escolher.
 */
export function guessKind(asset: string): AssetKind | null {
  if (!/^[A-Z]{4}\d{1,2}F?$/.test(asset)) return asset.trim() ? 'renda_fixa' : null
  const digits = asset.replace(/\D/g, '')
  if (['34', '35', '39'].includes(digits)) return 'bdr'
  if (digits === '11') return null
  return 'acao'
}

export const bucketOf = (kind: AssetKind, dayTrade: boolean): RealizedEvent['bucket'] =>
  kind === 'renda_fixa' ? 'renda_fixa' : kind === 'fii' ? 'fii' : dayTrade ? 'daytrade' : 'comum'
