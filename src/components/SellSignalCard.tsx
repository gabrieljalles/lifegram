import { useNavigate } from 'react-router-dom'
import { formatBRL, formatSignedBRL, sellSignals } from '../lib/invest'
import { useInvestments } from '../lib/useInvestments'

/**
 * Aviso da tela Hoje: os ativos que ja passaram da Selic + premio, liquido de
 * imposto. E so um lembrete para considerar a venda — o toque leva ao ativo.
 */
export default function SellSignalCard() {
  const navigate = useNavigate()
  const { positions, tax, benchmark } = useInvestments()
  const signals = sellSignals(positions, tax)
  if (signals.length === 0) return null

  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl border-2 border-[#39ff88] bg-[#39ff88]/10 p-3.5 shadow-[0_0_18px_rgba(57,255,136,0.3)]">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            💰
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#39ff88]">
              Hora de considerar vender
            </p>
            <p className="text-xs text-ink-300">
              {signals.length === 1 ? 'Este ativo passou' : 'Estes ativos passaram'} de{' '}
              {benchmark.long}, já descontado o imposto.
            </p>
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {signals.map((p) => (
            <li key={p.asset}>
              <button
                type="button"
                onClick={() =>
                  navigate(`/financeiro/investimentos/ativo/${encodeURIComponent(p.asset)}`)
                }
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-ink-950/40 px-3 py-2 text-left active:bg-ink-950/60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{p.asset}</span>
                  <span className="tnum block text-[11px] text-ink-400">
                    vendendo hoje: {formatBRL(p.netValue)} líquido
                  </span>
                </span>
                <span className="tnum shrink-0 text-right">
                  <span className="block text-sm font-black text-[#39ff88]">
                    {formatSignedBRL(p.vsSelic)}
                  </span>
                  <span className="block text-[10px] text-ink-400">acima da meta ›</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
