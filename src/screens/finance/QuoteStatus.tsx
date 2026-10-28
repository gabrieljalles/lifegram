import { useCallback, useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Button } from '../../components/ui'
import {
  AUTO_REFRESH_MS,
  brapiToken,
  isB3Ticker,
  lastQuoteRefresh,
  refreshQuotes,
  setBrapiToken,
  type QuoteRefresh,
} from '../../lib/quotes'
import { useApp } from '../../lib/store'
import type { InvestmentBuy } from '../../lib/types'

const input =
  'w-full rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm outline-none focus:border-brand-500'

/** Primeira compra de cada ativo: o historico automatico comeca nela. */
function assetsOf(buys: InvestmentBuy[]) {
  const first = new Map<string, string>()
  for (const b of buys) {
    const current = first.get(b.asset)
    if (!current || b.bought_on < current) first.set(b.asset, b.bought_on)
  }
  return [...first].map(([asset, firstBuy]) => ({ asset, firstBuy }))
}

/**
 * Faixa de cotacoes: quando atualizou, botao de atualizar e, se algum ticker
 * pedir, o campo da chave gratis da brapi. Atualiza sozinha ao abrir a tela
 * (no maximo a cada 30 min, ou quando aparece ativo novo).
 */
export default function QuoteStatus({ buys }: { buys: InvestmentBuy[] }) {
  const { reload } = useApp()
  const [last, setLast] = useState<QuoteRefresh | null>(null)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [askToken, setAskToken] = useState(false)
  const autoRan = useRef(false)

  const run = useCallback(async () => {
    setBusy(true)
    try {
      const result = await refreshQuotes(assetsOf(buys))
      setLast(result)
      if (result.updated.length > 0) await reload()
    } finally {
      setBusy(false)
    }
  }, [buys, reload])

  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    void lastQuoteRefresh().then((previous) => {
      setLast(previous)
      const tickers = assetsOf(buys).filter((a) => isB3Ticker(a.asset))
      if (tickers.length === 0) return
      const seen = new Set([...(previous?.updated ?? []), ...(previous?.needToken ?? [])])
      const stale = !previous || Date.now() - parseISO(previous.at).getTime() > AUTO_REFRESH_MS
      if (stale || tickers.some((t) => !seen.has(t.asset))) void run()
    })
  }, [buys, run])

  const needToken = last?.needToken ?? []
  const showToken = askToken || needToken.length > 0

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-ink-400">
          {busy
            ? 'Buscando cotações na B3…'
            : last
              ? `Cotações da B3 · ${format(parseISO(last.at), "dd/MM 'às' HH:mm")}`
              : 'Cotações automáticas pela brapi (B3)'}
          {last && last.manual.length > 0 && (
            <span className="block">Manual: {last.manual.join(', ')}</span>
          )}
        </p>
        <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy}>
          {busy ? '…' : '↻ Atualizar'}
        </Button>
      </div>

      {last && last.errors.length > 0 && (
        <p className="mt-2 text-[11px] text-fire-400">⚠️ {last.errors.join(' · ')}</p>
      )}

      {showToken ? (
        <div className="mt-3 border-t border-ink-700 pt-3">
          <p className="text-[11px] leading-relaxed text-ink-300">
            {needToken.length > 0 && (
              <>
                <b className="text-pr-400">{needToken.join(', ')}</b> precisa(m) da chave grátis da
                brapi.{' '}
              </>
            )}
            Crie a conta em{' '}
            <a
              href="https://brapi.dev/dashboard"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-brand-400 underline"
            >
              brapi.dev
            </a>{' '}
            (entra com Google, sem cartão), copie o token e cole aqui. Fica só neste aparelho.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={brapiToken() ? 'Chave salva — cole outra para trocar' : 'Token da brapi'}
              className={input}
              autoComplete="off"
            />
            <Button
              size="sm"
              disabled={!token.trim()}
              onClick={() => {
                setBrapiToken(token)
                setToken('')
                setAskToken(false)
                void run()
              }}
            >
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAskToken(true)}
          className="mt-1 text-[11px] font-semibold text-ink-400 underline"
        >
          {brapiToken() ? 'Trocar chave da brapi' : 'Usar chave da brapi'}
        </button>
      )}
    </div>
  )
}
