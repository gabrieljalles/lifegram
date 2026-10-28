import { useNavigate } from 'react-router-dom'
import { GearIcon, SelicVerdict } from '../../components/finance-ui'
import { formatBRL, formatPct } from '../../lib/invest'
import { useApp } from '../../lib/store'
import { useInvestments } from '../../lib/useInvestments'

/** Financeiro: a porta de entrada das areas de dinheiro. Por enquanto, investimentos. */
export default function FinanceHome() {
  const navigate = useNavigate()
  const { settings } = useApp()
  const { summary, buys, apuracao, today } = useInvestments()
  const hasBuys = buys.length > 0
  const paid = new Set(settings.finance_darf_paid ?? [])
  const pending = apuracao.months.filter(
    (m) => m.darf > 0 && !paid.has(m.month) && m.month < today.slice(0, 7),
  )
  const losses = apuracao.losses.comum + apuracao.losses.daytrade + apuracao.losses.fii

  return (
    <div className="pb-6">
      <header className="safe-t flex items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Financeiro</h1>
          <p className="text-sm text-ink-400">
            Seu dinheiro trabalhando — e se está rendendo mais que a Selic, depois do imposto.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/financeiro/configuracoes')}
          aria-label="Configurar impostos"
          className="-mr-2 rounded-full p-2 text-ink-300 active:bg-ink-800"
        >
          <GearIcon />
        </button>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-3">
        <button
          type="button"
          onClick={() => navigate('/financeiro/investimentos')}
          className="w-full rounded-2xl border-2 border-brand-500/50 bg-brand-600/10 p-4 text-left active:bg-brand-600/20"
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-950/50 text-3xl"
              aria-hidden="true"
            >
              📈
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-black">Investimentos</p>
              <p className="text-xs text-ink-400">
                {hasBuys
                  ? 'Capital total contra a Selic, compra a compra'
                  : 'Registre sua primeira compra de ativo'}
              </p>
            </div>
            <span className="text-ink-400" aria-hidden="true">
              ›
            </span>
          </div>
          {hasBuys && (
            <div className="mt-3 flex items-end justify-between gap-2 border-t border-ink-700/60 pt-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-ink-400">
                  Capital total
                </p>
                <p className="tnum text-xl font-black">{formatBRL(summary.value)}</p>
                <p
                  className={`tnum text-xs font-bold ${summary.returnPct >= 0 ? 'text-go-400' : 'text-fire-400'}`}
                >
                  {formatPct(summary.returnPct)} · Selic {formatPct(summary.selicPct)} (líquidos)
                </p>
              </div>
              <SelicVerdict beat={summary.beat} vsSelic={summary.vsSelic} compact />
            </div>
          )}
        </button>

        {hasBuys && (
          <button
            type="button"
            onClick={() => navigate('/financeiro/impostos')}
            className="w-full rounded-2xl border border-ink-700 bg-ink-850 p-4 text-left active:bg-ink-800"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-950/50 text-3xl"
                aria-hidden="true"
              >
                🧾
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-black">Impostos e DARF</p>
                <p className="text-xs text-ink-400">
                  {pending.length > 0
                    ? `${pending.length === 1 ? 'DARF' : 'DARFs'} a pagar: ${formatBRL(pending.reduce((s, m) => s + m.darf, 0))}`
                    : losses > 0.005
                      ? `Prejuízo para abater: ${formatBRL(losses)}`
                      : 'Apuração mensal, isenção e prejuízo acumulado'}
                </p>
              </div>
              {pending.length > 0 && (
                <span className="h-2.5 w-2.5 rounded-full bg-pr-500" aria-hidden="true" />
              )}
              <span className="text-ink-400" aria-hidden="true">
                ›
              </span>
            </div>
          </button>
        )}

        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-ink-700 p-4 opacity-60">
          <span className="text-3xl" aria-hidden="true">
            💳
          </span>
          <div>
            <p className="font-bold">Gastos e entradas</p>
            <p className="text-xs text-ink-400">Em breve</p>
          </div>
        </div>
      </div>
    </div>
  )
}
