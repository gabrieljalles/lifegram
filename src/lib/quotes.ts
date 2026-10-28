import { format } from 'date-fns'
import { allInvestmentQuotes, metaGet, metaSet, putInvestmentQuote } from './db'
import { newId, nowISO, type InvestmentQuote } from './types'

/**
 * Cotacoes automaticas pela brapi.dev (B3, com CORS liberado: o app chama
 * direto). Sem chave, so PETR4, VALE3, ITUB4 e MGLU3 respondem; com a chave
 * gratis da conta, qualquer ticker da B3. A chave fica no aparelho, como o
 * Client ID do Google — o pior uso indevido possivel e gastar a cota gratis.
 *
 * Uma chamada traz o preco atual e os fechamentos diarios dos ultimos meses:
 * o historico preenche o grafico desde a compra, sem degraus de cotacao
 * informada a mao. Ativo que nao e ticker da B3 (Tesouro, CDB) fica manual.
 */

const API = 'https://brapi.dev/api/quote'
const TOKEN_KEY = 'brapi:token'
const LAST_RUN_KEY = 'quotes:last_run'
/** Abrir a tela de novo antes disso nao gasta cota. */
export const AUTO_REFRESH_MS = 30 * 60 * 1000

/** PETR4, IVVB11, BOVA11, TAEE11, KNRI11, AAPL34, PETR4F… */
export const isB3Ticker = (asset: string) => /^[A-Z]{4}\d{1,2}F?$/.test(asset)

export function brapiToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setBrapiToken(token: string | null) {
  try {
    if (token?.trim()) localStorage.setItem(TOKEN_KEY, token.trim())
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    throw new Error('Este navegador não deixa salvar a chave.')
  }
}

interface BrapiQuote {
  regularMarketPrice?: number
  regularMarketTime?: string
  historicalDataPrice?: Array<{ date: number; close: number | null }>
}

class MissingToken extends Error {}

async function fetchQuote(ticker: string, token: string | null): Promise<BrapiQuote> {
  const params = new URLSearchParams({ range: '3mo', interval: '1d' })
  if (token) params.set('token', token)
  const response = await fetch(`${API}/${encodeURIComponent(ticker)}?${params.toString()}`)
  if (response.status === 401) throw new MissingToken(ticker)
  if (response.status === 404) throw new Error(`${ticker} não encontrado na B3`)
  if (!response.ok) throw new Error(`brapi respondeu ${response.status} para ${ticker}`)
  const body = (await response.json()) as { results?: BrapiQuote[] }
  const quote = body.results?.[0]
  if (!quote?.regularMarketPrice) throw new Error(`Sem preço para ${ticker}`)
  return quote
}

export interface QuoteRefresh {
  updated: string[]
  /** Tickers que precisam da chave gratis da brapi. */
  needToken: string[]
  /** Ativos que nao sao ticker da B3: continuam com cotacao manual. */
  manual: string[]
  errors: string[]
  at: string
}

/**
 * Atualiza os ativos: grava o preco de hoje (sempre) e completa os dias do
 * historico que ainda nao tem cotacao, a partir da primeira compra. Cotacao
 * informada a mao num dia passado e respeitada.
 */
export async function refreshQuotes(
  assets: Array<{ asset: string; firstBuy: string }>,
): Promise<QuoteRefresh> {
  const token = brapiToken()
  const result: QuoteRefresh = { updated: [], needToken: [], manual: [], errors: [], at: nowISO() }
  const existing = await allInvestmentQuotes()
  const today = format(new Date(), 'yyyy-MM-dd')

  for (const { asset, firstBuy } of assets) {
    if (!isB3Ticker(asset)) {
      result.manual.push(asset)
      continue
    }
    try {
      const quote = await fetchQuote(asset, token)
      const known = new Map(
        existing.filter((q) => q.asset === asset).map((q) => [q.quoted_on, q] as const),
      )
      const write = async (day: string, price: number) => {
        const current = known.get(day)
        if (current && day !== today) return
        if (current && current.price === price) return
        const row: InvestmentQuote = {
          id: current?.id ?? newId(),
          user_id: current?.user_id ?? null,
          asset,
          price,
          quoted_on: day,
          updated_at: nowISO(),
        }
        await putInvestmentQuote(row)
        known.set(day, row)
      }
      for (const point of quote.historicalDataPrice ?? []) {
        if (point.close == null) continue
        const day = format(new Date(point.date * 1000), 'yyyy-MM-dd')
        if (day >= firstBuy && day < today) await write(day, point.close)
      }
      const marketDay = quote.regularMarketTime
        ? format(new Date(quote.regularMarketTime), 'yyyy-MM-dd')
        : today
      // Fim de semana ou antes da abertura: o ultimo pregao vale como preco
      // de hoje tambem.
      if (marketDay >= firstBuy && marketDay < today)
        await write(marketDay, quote.regularMarketPrice!)
      await write(today, quote.regularMarketPrice!)
      result.updated.push(asset)
    } catch (error) {
      if (error instanceof MissingToken) result.needToken.push(asset)
      else result.errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  await metaSet(LAST_RUN_KEY, result)
  return result
}

export async function lastQuoteRefresh(): Promise<QuoteRefresh | null> {
  return (await metaGet<QuoteRefresh>(LAST_RUN_KEY)) ?? null
}
