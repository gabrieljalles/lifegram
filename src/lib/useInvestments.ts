import { useMemo } from 'react'
import { format } from 'date-fns'
import { capitalTimeline, portfolio, selicIndex, type PortfolioInput } from './invest'
import { useSelic } from './selic'
import { useApp } from './store'
import { DEFAULT_TAX_SETTINGS, type FinanceTaxSettings } from './taxes'
import type { AppSettings } from './types'

/** As aliquotas da engrenagem por cima do padrao (campo novo nunca fica faltando). */
export function taxSettingsOf(settings: AppSettings): FinanceTaxSettings {
  const merged = { ...DEFAULT_TAX_SETTINGS, ...settings.finance_tax }
  // A engrenagem chegou a gravar "20.000" lido como 20 (ponto como decimal).
  // Limite de isencao abaixo de R$ 1.000 so pode ser esse erro: volta ao milhar.
  if (merged.stockExemptionLimit > 0 && merged.stockExemptionLimit < 1000)
    merged.stockExemptionLimit *= 1000
  return merged
}

export interface Benchmark {
  /** Curto, para rotulos apertados: "Selic" ou "Meta". */
  short: string
  /** Por extenso: "Selic" ou "120% da Selic". */
  long: string
}

export const benchmarkOf = (tax: FinanceTaxSettings): Benchmark =>
  tax.selicMultiplier === 1
    ? { short: 'Selic', long: 'Selic' }
    : {
        short: 'Meta',
        long: `${(tax.selicMultiplier * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da Selic`,
      }

/** Carteira pronta para a tela: posicoes liquidas, apuracao e linha do tempo contra a Selic. */
export function useInvestments() {
  const { investmentBuys, investmentQuotes, investmentSales, settings } = useApp()
  const today = format(new Date(), 'yyyy-MM-dd')
  const firstBuy = investmentBuys.length > 0 ? investmentBuys[0].bought_on : null
  const selic = useSelic(firstBuy)
  const tax = useMemo(() => taxSettingsOf(settings), [settings])

  return useMemo(() => {
    const input: PortfolioInput = {
      buys: investmentBuys,
      sales: investmentSales,
      quotes: investmentQuotes,
      index: selicIndex(selic.rates, tax.selicMultiplier),
      pureIndex: tax.selicMultiplier === 1 ? undefined : selicIndex(selic.rates),
      today,
      settings: tax,
    }
    return {
      ...portfolio(input),
      /** Nome da comparacao: "Selic" ou, com premio de risco, "meta". */
      benchmark: benchmarkOf(tax),
      input,
      buys: investmentBuys,
      sales: investmentSales,
      quotes: investmentQuotes,
      today,
      index: input.index,
      selic,
      tax,
      timeline: capitalTimeline(input),
    }
  }, [investmentBuys, investmentSales, investmentQuotes, selic, today, tax])
}
