import { useEffect, useState } from 'react'
import { addDays, addYears, format, parseISO } from 'date-fns'
import { metaGet, metaSet } from './db'
import type { SelicRates } from './invest'

/**
 * Selic diaria do Banco Central (SGS, serie 11: % ao dia, por dia util). API
 * publica e com CORS liberado — o app busca direto, sem servidor. O que ja
 * chegou fica guardado no aparelho: a comparacao abre offline e so baixa o
 * que falta.
 */

const SERIES = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados'
const CACHE_KEY = 'selic:daily'

interface SelicCache {
  rates: SelicRates
  /** Intervalo ja buscado (YYYY-MM-DD), inclusive. */
  from: string
  through: string
}

const br = (day: string) => format(parseISO(day), 'dd/MM/yyyy')
const iso = (ddMMyyyy: string) => {
  const [d, m, y] = ddMMyyyy.split('/')
  return `${y}-${m}-${d}`
}

/** A API limita series diarias a 10 anos por consulta: busca em blocos. */
async function fetchRange(from: string, to: string): Promise<SelicRates> {
  const rates: SelicRates = {}
  let start = from
  while (start <= to) {
    const blockEnd = format(addDays(addYears(parseISO(start), 9), -1), 'yyyy-MM-dd')
    const end = blockEnd < to ? blockEnd : to
    const response = await fetch(
      `${SERIES}?formato=json&dataInicial=${br(start)}&dataFinal=${br(end)}`,
    )
    // 404 = intervalo sem dia util (ex.: so fim de semana): nada a somar.
    if (response.status !== 404) {
      if (!response.ok) throw new Error(`Banco Central respondeu ${response.status}`)
      for (const row of (await response.json()) as Array<{ data: string; valor: string }>) {
        rates[iso(row.data)] = Number(row.valor)
      }
    }
    start = format(addDays(parseISO(end), 1), 'yyyy-MM-dd')
  }
  return rates
}

export async function cachedSelic(): Promise<SelicCache | null> {
  return (await metaGet<SelicCache>(CACHE_KEY)) ?? null
}

/**
 * Garante as taxas de `from` ate hoje. Rebusca sempre os ultimos dias: a taxa
 * de hoje so sai no fim do dia.
 */
export async function refreshSelic(from: string, today: string): Promise<SelicCache> {
  const cache = await cachedSelic()
  if (!cache) {
    const rates = await fetchRange(from, today)
    const fresh = { rates, from, through: today }
    await metaSet(CACHE_KEY, fresh)
    return fresh
  }
  const rates = { ...cache.rates }
  if (from < cache.from) Object.assign(rates, await fetchRange(from, cache.from))
  const recent = format(addDays(parseISO(cache.through), -5), 'yyyy-MM-dd')
  Object.assign(rates, await fetchRange(recent < from ? from : recent, today))
  const next = { rates, from: from < cache.from ? from : cache.from, through: today }
  await metaSet(CACHE_KEY, next)
  return next
}

export interface SelicState {
  rates: SelicRates
  loading: boolean
  error: string | null
}

/** Taxas para a tela: abre com o que esta guardado e atualiza por tras. */
export function useSelic(from: string | null): SelicState {
  const [state, setState] = useState<SelicState>({ rates: {}, loading: true, error: null })

  useEffect(() => {
    let alive = true
    void (async () => {
      const cache = await cachedSelic()
      if (alive && cache) setState({ rates: cache.rates, loading: Boolean(from), error: null })
      if (!from) {
        if (alive) setState((s) => ({ ...s, loading: false }))
        return
      }
      try {
        const fresh = await refreshSelic(from, format(new Date(), 'yyyy-MM-dd'))
        if (alive) setState({ rates: fresh.rates, loading: false, error: null })
      } catch (error) {
        if (alive) {
          setState((s) => ({
            ...s,
            loading: false,
            error: error instanceof Error ? error.message : 'Sem conexão com o Banco Central.',
          }))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [from])

  return state
}
