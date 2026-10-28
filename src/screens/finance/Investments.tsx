import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { CapitalLines } from '../../components/charts'
import {
  ChartModeToggle,
  PositionCard,
  SelicContribution,
  SelicVerdict,
} from '../../components/finance-ui'
import { Button, Card, EmptyState, Header, Section } from '../../components/ui'
import { formatBRL, formatBRLShort, formatPct, formatSignedBRL } from '../../lib/invest'
import { useInvestments } from '../../lib/useInvestments'
import QuoteStatus from './QuoteStatus'

/** Cotacao mais velha que isso deixa o grafico desatualizado: a tela avisa. */
const STALE_DAYS = 7

type View = 'condensado' | 'ativo'
const VIEW_KEY = 'invest:view'

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'ativo' ? 'ativo' : 'condensado'
  } catch {
    return 'condensado'
  }
}

export default function Investments() {
  const navigate = useNavigate()
  const { buys, positions, summary, timeline, index, selic, today, tax, benchmark } =
    useInvestments()
  const [view, setViewState] = useState<View>(readView)
  const [gain, setGain] = useState(true)
  const setView = (next: View) => {
    setViewState(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // sem storage: a escolha vale so ate fechar
    }
  }

  const chart = useMemo(
    () =>
      timeline.map((p) => ({
        label: format(parseISO(p.day), 'dd/MM'),
        date: parseISO(p.day),
        value: p.value,
        selic: p.selic,
        invested: p.invested,
      })),
    [timeline],
  )
  const stale = positions.filter(
    (p) => differenceInCalendarDays(parseISO(today), parseISO(p.priceDay)) > STALE_DAYS,
  )

  const buyButton = (
    <div className="flex gap-1.5">
      {positions.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate('/financeiro/investimentos/vender')}
        >
          Vender
        </Button>
      )}
      <Button size="sm" onClick={() => navigate('/financeiro/investimentos/comprar')}>
        + Comprar
      </Button>
    </div>
  )
  const m = summary.month
  const r = summary.realized

  if (buys.length === 0) {
    return (
      <div>
        <Header title="Investimentos" back="/financeiro" />
        <EmptyState
          icon="📈"
          title="Nenhum ativo ainda"
          description="Registre cada compra com quantidade, preço médio e data. O app acompanha o capital e compara cada compra com a Selic desde o dia dela."
          action={
            <Button onClick={() => navigate('/financeiro/investimentos/comprar')}>
              Comprar ativo
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="pb-6">
      <Header title="Investimentos" back="/financeiro" action={buyButton} />

      <div className="px-4 pt-4">
        <div
          className="grid grid-cols-2 gap-1 rounded-xl border border-ink-700 bg-ink-850 p-1"
          role="tablist"
        >
          {(
            [
              { id: 'condensado', label: '📊 Condensado' },
              { id: 'ativo', label: '🧩 Por ativo' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => setView(tab.id)}
              className={`rounded-lg py-2 text-sm font-bold transition-colors ${
                view === tab.id ? 'bg-brand-600 text-white' : 'text-ink-300 active:bg-ink-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <QuoteStatus buys={buys} />
        </div>
      </div>

      {view === 'condensado' ? (
        <>
          <div className="px-4 pt-3">
            <Card className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-400">
                Capital total
              </p>
              <p className="tnum mt-0.5 text-3xl font-black">{formatBRL(summary.value)}</p>
              <p
                className={`tnum text-sm font-bold ${summary.netValue - summary.invested >= 0 ? 'text-go-400' : 'text-fire-400'}`}
              >
                {formatSignedBRL(summary.netValue - summary.invested)} (
                {formatPct(summary.returnPct)}) líquido
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-ink-900/60 px-3 py-2">
                  <p className="text-ink-400">Vendendo tudo hoje</p>
                  <p className="tnum font-bold">{formatBRL(summary.netValue)}</p>
                  <p className="tnum text-[10px] text-ink-500">
                    {summary.taxIfSold > 0.005 ? `IR ${formatBRL(summary.taxIfSold)}` : 'sem IR'}
                  </p>
                </div>
                <div className="rounded-xl bg-ink-900/60 px-3 py-2">
                  <p className="text-ink-400">Se fosse {benchmark.long}</p>
                  <p className="tnum font-bold">{formatBRL(summary.selicNet)}</p>
                  <p className="tnum text-[10px] text-ink-500">
                    {formatPct(summary.selicPct)} · líquido de IR
                  </p>
                </div>
              </div>

              {m.stockSalesIfAll > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-ink-400">
                    <span>Vendas de ações no mês (com tudo vendido)</span>
                    <span className="tnum">
                      {formatBRLShort(m.stockSalesIfAll)} / {formatBRLShort(m.limit)}
                    </span>
                  </div>
                  <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-ink-500"
                      style={{ width: `${Math.min(100, (m.stockSalesIfAll / m.limit) * 100)}%` }}
                    />
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full ${m.stockSalesIfAll > m.limit ? 'bg-fire-500' : 'bg-go-500'}`}
                      style={{ width: `${Math.min(100, (m.stockSales / m.limit) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-ink-500">
                    {m.stockSales > 0 ? `Já vendido no mês: ${formatBRL(m.stockSales)}. ` : ''}
                    {m.stockSalesIfAll > m.limit
                      ? 'Vender tudo passaria da isenção: o lucro de ações do mês inteiro pagaria 15%.'
                      : 'Vender tudo ainda caberia na isenção de ações.'}
                  </p>
                </div>
              )}

              {r && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-ink-900/60 px-3 py-2 text-xs">
                  <span className="text-ink-400">Vendas feitas (líquido)</span>
                  <span
                    className={`tnum font-bold ${r.net >= 0 ? 'text-go-400' : 'text-fire-400'}`}
                  >
                    {formatSignedBRL(r.net)}{' '}
                    <span className="font-normal text-ink-400">
                      · Selic {formatSignedBRL(r.selicNet)}
                    </span>
                  </span>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <SelicVerdict
                  beat={summary.beat}
                  vsSelic={summary.vsSelic}
                  label={benchmark.short}
                />
                <span className="tnum text-[11px] text-ink-400">
                  {summary.buysBeating} de {summary.buysTotal}{' '}
                  {summary.buysTotal === 1 ? 'compra bate' : 'compras batem'}
                </span>
              </div>
            </Card>
          </div>

          <Section title="Evolução" action={<ChartModeToggle gain={gain} onChange={setGain} />}>
            <Card className="p-3 pr-4">
              {chart.length > 1 ? (
                <CapitalLines
                  data={chart}
                  gain={gain}
                  formatMoney={formatBRL}
                  formatAxis={formatBRLShort}
                />
              ) : (
                <p className="px-1 py-6 text-center text-sm text-ink-400">
                  O gráfico aparece a partir do segundo dia da primeira compra.
                </p>
              )}
              <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-400">
                Gráfico em valores brutos (com o dinheiro das vendas); os números de cima já
                descontam o imposto.{' '}
                {selic.error
                  ? `⚠️ Selic não atualizada (${selic.error}). Usando a última guardada.`
                  : selic.loading
                    ? 'Buscando a Selic no Banco Central…'
                    : index.annual !== null
                      ? `${benchmark.long} ${index.annual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.a. · Banco Central, até ${format(parseISO(index.lastDay!), 'dd/MM')}${tax.selicMultiplier !== 1 ? ' · prêmio por arriscar além da Selic' : ''}`
                      : 'Selic indisponível.'}
              </p>
            </Card>
            {stale.length > 0 && (
              <p className="mt-2 rounded-xl border border-pr-500/40 bg-pr-500/10 px-3 py-2 text-[11px] leading-relaxed text-pr-400">
                💡 {stale.map((p) => p.asset).join(', ')} {stale.length === 1 ? 'está' : 'estão'}{' '}
                com preço de mais de {STALE_DAYS} dias. Toque no ativo e atualize a cotação para o
                capital refletir o mercado.
              </p>
            )}
          </Section>

          {summary.contributions.length > 1 && (
            <Section title="Quem puxa o resultado">
              <Card className="p-4">
                <SelicContribution rows={summary.contributions} total={summary.vsSelic} />
                <p className="mt-2 text-[10px] leading-relaxed text-ink-500">
                  Líquido com líquido, como se vendesse a carteira inteira hoje. O imposto (
                  {tax.swingRate}% nas ações fora da isenção) é dividido entre os ativos com lucro.
                </p>
              </Card>
            </Section>
          )}
        </>
      ) : (
        <Section title={`Ativos (${positions.length})`}>
          <div className="flex flex-col gap-2.5">
            {positions.length === 0 && (
              <p className="text-sm text-ink-400">
                Tudo vendido. As vendas estão em Impostos e DARF.
              </p>
            )}
            {positions.map((p) => (
              <PositionCard
                key={p.asset}
                position={p}
                label={benchmark.short}
                onClick={() =>
                  navigate(`/financeiro/investimentos/ativo/${encodeURIComponent(p.asset)}`)
                }
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
