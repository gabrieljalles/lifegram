import { useMemo } from 'react'
import { format } from 'date-fns'
import { capitalTimeline, portfolio, selicIndex, type PortfolioInput } from './invest'
import { useSelic } from './selic'
import { useApp } from './store'
import { DEFAULT_TAX_SETTINGS, type FinanceTaxSettings } from './taxes'
import type { AppSettings } from './types'

/** As aliquotas da engrenagem por cima do padrao (campo novo nunca fica faltando). */
export const taxSettingsOf = (settings: AppSettings): FinanceTaxSettings => ({
  ...DEFAULT_TAX_SETTINGS,
  ...settings.finance_tax,
})

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
