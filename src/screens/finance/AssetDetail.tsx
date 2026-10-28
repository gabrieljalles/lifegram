import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { CapitalLines } from '../../components/charts'
import {
  ChartModeToggle,
  DirectionOnly,
  KindPicker,
  MaturingBanner,
  ReturnBars,
  SelicVerdict,
} from '../../components/finance-ui'
import { Button, Card, EmptyState, Header, Section } from '../../components/ui'
import {
  deleteBuy,
  deleteSale,
  parseDecimal,
  setAssetKind,
  setQuote,
} from '../../lib/investActions'
import {
  capitalTimeline,
  formatBRL,
  formatBRLShort,
  formatPct,
  formatQuantity,
  formatSignedBRL,
  holdingTime,
  kindOf,
  kindUnconfirmed,
  type SaleResult,
} from '../../lib/invest'
import { useApp } from '../../lib/store'
import { useInvestments } from '../../lib/useInvestments'
import { confirmDialog } from '../../lib/dialog'

const input =
  'w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500'

/** Um ativo: posicao liquida contra a Selic liquida, cotacao, compras e vendas. */
export default function AssetDetail() {
  const { asset: param } = useParams()
  const asset = decodeURIComponent(param ?? '')
  const navigate = useNavigate()
  const { reload } = useApp()
  const { positions, ledgers, buys, quotes, input: data, today, tax, benchmark } = useInvestments()
  const position = positions.find((p) => p.asset === asset)
  const ownLedger = ledgers.find((l) => l.asset === asset)
  const chart = useMemo(
    () =>
      capitalTimeline({
        ...data,
        buys: data.buys.filter((b) => b.asset === asset),
        sales: data.sales.filter((s) => s.asset === asset),
      }).map((p) => ({
        label: format(parseISO(p.day), 'dd/MM'),
        date: parseISO(p.day),
        value: p.value,
        selic: p.selic,
        selicPure: p.selicPure,
        invested: p.invested,
        bought: p.bought,
      })),
    [data, asset],
  )

  const [price, setPrice] = useState('')
  const [date, setDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [gain, setGain] = useState(true)

  if (!ownLedger) {
    return (
      <div>
        <Header title="Ativo" back="/financeiro/investimentos" />
        <EmptyState icon="🔍" title="Ativo não encontrado" />
      </div>
    )
  }
  const kind = kindOf(asset, buys)
  // Mais recente primeiro; no mesmo dia, o lancado por ultimo.
  const sales = [...ownLedger.sales].sort((a, b) =>
    `${b.sale.sold_on}${b.sale.created_at}`.localeCompare(`${a.sale.sold_on}${a.sale.created_at}`),
  )
  const salesList = (
    <Section title={`Vendas (${sales.length})`}>
      <div className="flex flex-col gap-2">
        {sales.map((r) => (
          <SaleCard
            key={r.sale.id}
            result={r}
            onDelete={async () => {
              if (
                !(await confirmDialog({
                  title: 'Apagar esta venda?',
                  message: 'O imposto do mês é recalculado.',
                  confirmLabel: 'Apagar',
                  danger: true,
                }))
              )
                return
              await deleteSale(r.sale)
              await reload()
            }}
          />
        ))}
      </div>
    </Section>
  )

  if (!position) {
    const gain = ownLedger.sales.reduce((s, r) => s + r.gain, 0)
    return (
      <div className="pb-6">
        <Header title={asset} back="/financeiro/investimentos" />
        <div className="px-4 pt-4">
          <Card className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-400">
              Posição encerrada
            </p>
            <p
              className={`tnum text-2xl font-black ${gain >= 0 ? 'text-go-400' : 'text-fire-400'}`}
            >
              {formatSignedBRL(gain)}
            </p>
            <p className="text-[11px] text-ink-400">
              Lucro bruto das vendas. O imposto de cada mês está em Impostos e DARF.
            </p>
          </Card>
        </div>
        {salesList}
      </div>
    )
  }
  const p = position
  const unconfirmed = kindUnconfirmed(asset, buys)
  const held = holdingTime(p.heldSince, today)
  const unit = parseDecimal(price)
  const history = quotes
    .filter((q) => q.asset === asset)
    .slice(-5)
    .reverse()

  const saveQuote = async () => {
    if (!(unit > 0) || saving) return
    setSaving(true)
    try {
      await setQuote(asset, unit, date)
      await reload()
      setPrice('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-6">
      <Header
        title={asset}
        back="/financeiro/investimentos"
        action={
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigate(`/financeiro/investimentos/vender?ativo=${encodeURIComponent(asset)}`)
              }
            >
              Vender
            </Button>
            <Button
              size="sm"
              onClick={() =>
                navigate(`/financeiro/investimentos/comprar?ativo=${encodeURIComponent(asset)}`)
              }
            >
              + Comprar
            </Button>
          </div>
        }
      />

      <div className="px-4 pt-4">
        <Card className="p-4">
          <p className="tnum mb-3 rounded-xl bg-ink-900/60 px-3 py-2 text-xs text-ink-300">
            ⏱ Na operação há <b className="text-ink-100">{held.label}</b> ({held.totalDays}{' '}
            {held.totalDays === 1 ? 'dia' : 'dias'}) · desde{' '}
            {format(parseISO(p.heldSince), 'dd/MM/yyyy')}
          </p>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-400">
                Posição
              </p>
              <p className="tnum text-3xl font-black">{formatBRL(p.value)}</p>
              <p
                className={`tnum text-sm font-bold ${p.netResult >= 0 ? 'text-go-400' : 'text-fire-400'}`}
              >
                {formatSignedBRL(p.netResult)} ({formatPct(p.returnPct)}) líquido
              </p>
            </div>
            {!p.maturing && (
              <SelicVerdict beat={p.beat} vsSelic={p.vsSelic} compact label={benchmark.short} />
            )}
          </div>

          {p.maturing && (
            <div className="mt-3 flex flex-col gap-2">
              <MaturingBanner since={p.heldSince} />
              <DirectionOnly position={p} label={benchmark.short} />
            </div>
          )}

          <div className="mt-3 rounded-xl bg-ink-900/60 px-3 py-2 text-[11px] leading-relaxed text-ink-300">
            Se vender tudo hoje: <b className="tnum">{formatBRL(p.netValue)}</b> no bolso
            {p.taxIfSold > 0.005 ? ` (IR ${formatBRL(p.taxIfSold)})` : ' (sem IR)'}. Na Selic, já
            descontado o IR de cada compra: <b className="tnum">{formatBRL(p.selicNet)}</b>.
            {p.kind === 'acao' && (
              <span className="block text-ink-400">
                Vendas de ações no mês com esta: {formatBRL(p.stockSalesIfSold)} de{' '}
                {formatBRL(tax.stockExemptionLimit)}
                {p.stockSalesIfSold > tax.stockExemptionLimit
                  ? ' — passa da isenção, o mês inteiro é tributado.'
                  : ' — dentro da isenção.'}
              </span>
            )}
          </div>

          <div className="mt-4">
            <ReturnBars returnPct={p.returnPct} selicPct={p.selicPct} label={benchmark.short} />
          </div>

          {/* Os precos que contam a historia: o que voce pagou, o que vale
              agora e os dois empates — sair do zero a zero contra a Selic e
              ganhar o premio que voce exige por arriscar. */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <PriceBox
              label="Preço médio"
              value={p.avgPrice}
              hint={`${formatQuantity(p.quantity)} un.`}
            />
            <PriceBox
              label={p.quoted ? 'Cotação' : 'Preço atual'}
              value={p.price}
              hint={format(parseISO(p.priceDay), 'dd/MM')}
              tone={p.beat ? 'good' : p.price >= p.breakEvenPure ? undefined : 'bad'}
            />
            <PriceBox
              label="Empate c/ Selic"
              value={p.breakEvenPure}
              hint={gapHint(p.price, p.breakEvenPure)}
              tone={p.price >= p.breakEvenPure ? 'good' : 'bad'}
              highlight
            />
            <PriceBox
              label="Empate c/ Selic + prêmio"
              value={p.breakEven}
              hint={
                tax.selicMultiplier === 1
                  ? 'sem prêmio · ⚙ Financeiro'
                  : `${benchmark.long} · ${gapHint(p.price, p.breakEven)}`
              }
              tone={tax.selicMultiplier === 1 ? undefined : p.beat ? 'good' : 'bad'}
              highlight
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
            Cada compra rende Selic desde a própria data, e a Selic também paga IR pelos dias de
            cada uma. O preço de empate é o que o ativo precisa valer hoje para, vendido e pago o
            imposto do mês, sobrar o mesmo que a Selic líquida — acima dele você saiu do zero a
            zero. O empate com prêmio pede a Selic vezes o multiplicador da engrenagem: acima dele,
            o risco está pagando o que você exige.
          </p>
        </Card>
      </div>

      <Section title="Tipo do ativo">
        <Card className="p-4">
          {unconfirmed && (
            <p className="mb-2 text-[11px] font-semibold text-pr-400">
              Confirme o tipo: o imposto muda entre FII, ETF e ação.
            </p>
          )}
          <KindPicker
            value={unconfirmed ? null : kind}
            onChange={async (next) => {
              await setAssetKind(asset, next, buys)
              await reload()
            }}
          />
        </Card>
      </Section>

      {chart.length > 1 && (
        <Section title="Evolução" action={<ChartModeToggle gain={gain} onChange={setGain} />}>
          <Card className="p-3 pr-4">
            <CapitalLines
              data={chart}
              gain={gain}
              formatMoney={formatBRL}
              formatAxis={formatBRLShort}
              premiumLabel={tax.selicMultiplier === 1 ? undefined : benchmark.long}
              height={180}
            />
          </Card>
        </Section>
      )}

      <Section title="Atualizar cotação">
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-2">
            <input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder={`R$ ${p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              aria-label="Preço atual do ativo"
              className={`${input} tnum`}
            />
            <input
              type="date"
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value)}
              aria-label="Data da cotação"
              className={`${input} [color-scheme:dark]`}
            />
          </div>
          <Button
            className="mt-2 w-full"
            onClick={() => void saveQuote()}
            disabled={!(unit > 0) || saving}
          >
            Salvar cotação
          </Button>
          {history.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {history.map((q) => (
                <li
                  key={q.id}
                  className="tnum rounded-full bg-ink-800 px-2.5 py-1 text-[11px] text-ink-300"
                >
                  {format(parseISO(q.quoted_on), 'dd/MM')} · {formatBRL(q.price)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>

      {sales.length > 0 && salesList}

      <Section title={`Compras na posição (${p.buys.length})`}>
        <div className="flex flex-col gap-2">
          {[...p.buys]
            .sort((a, b) =>
              `${b.buy.bought_on}${b.buy.created_at}`.localeCompare(
                `${a.buy.bought_on}${a.buy.created_at}`,
              ),
            )
            .map((r) => (
              <Card key={r.buy.id} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="tnum text-sm font-bold">
                      {formatQuantity(r.quantity)} × {formatBRL(r.buy.price)}
                      {r.quantity < r.buy.quantity - 1e-9 && (
                        <span className="font-normal text-ink-400">
                          {` (de ${formatQuantity(r.buy.quantity)})`}
                        </span>
                      )}
                    </p>
                    <p className="tnum text-[11px] text-ink-400">
                      {format(parseISO(r.buy.bought_on), 'dd/MM/yyyy')} · {formatBRL(r.amount)}
                    </p>
                  </div>
                  <SelicVerdict
                    beat={r.beat}
                    vsSelic={r.netValue - r.selicNet}
                    compact
                    label={benchmark.short}
                  />
                </div>
                <div className="mt-2.5">
                  <ReturnBars
                    returnPct={r.returnPct}
                    selicPct={r.selicPct}
                    label={benchmark.short}
                  />
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <span className="tnum text-[11px] text-ink-400">
                    Selic líq. {formatBRL(r.selicNet)} · hoje líq. {formatBRL(r.netValue)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/financeiro/investimentos/comprar?editar=${r.buy.id}&ativo=${encodeURIComponent(asset)}`,
                      )
                    }
                    className="ml-auto rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-400 active:bg-ink-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        !(await confirmDialog({
                          title: 'Apagar esta compra?',
                          message: `${formatQuantity(r.buy.quantity)} × ${formatBRL(r.buy.price)} em ${format(parseISO(r.buy.bought_on), 'dd/MM/yyyy')}. A posição, o imposto e a Selic são recalculados.`,
                          confirmLabel: 'Apagar',
                          danger: true,
                        }))
                      )
                        return
                      await deleteBuy(r.buy)
                      await reload()
                    }}
                    className="rounded-lg px-2 py-1 text-[11px] font-semibold text-fire-400 active:bg-ink-800"
                  >
                    Apagar
                  </button>
                </div>
              </Card>
            ))}
        </div>
      </Section>
    </div>
  )
}

/** Uma venda: day trade e swing separados, lucro bruto e o que a Selic teria dado ate ali. */
function SaleCard({ result: r, onDelete }: { result: SaleResult; onDelete: () => void }) {
  const qty = r.dayTradeQty + r.swingQty
  const beat = r.cost + r.gain >= r.selicGross
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tnum text-sm font-bold">
            {formatQuantity(r.sale.quantity)} × {formatBRL(r.sale.price)}
          </p>
          <p className="tnum text-[11px] text-ink-400">
            {format(parseISO(r.sale.sold_on), 'dd/MM/yyyy')} · {formatBRL(qty * r.sale.price)}
          </p>
        </div>
        <div className="text-right">
          <p className={`tnum text-sm font-black ${r.gain >= 0 ? 'text-go-400' : 'text-fire-400'}`}>
            {formatSignedBRL(r.gain)}
          </p>
          <p className="text-[10px] text-ink-400">lucro bruto</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap gap-1 text-[10px] font-bold">
          {r.dayTradeQty > 0 && (
            <span className="rounded-full bg-pr-500/15 px-2 py-0.5 text-pr-400">
              Day trade {formatQuantity(r.dayTradeQty)}
            </span>
          )}
          {r.swingQty > 0 && (
            <span className="rounded-full bg-ink-800 px-2 py-0.5 text-ink-300">
              Swing {formatQuantity(r.swingQty)}
            </span>
          )}
          {r.withheld > 0 && (
            <span className="rounded-full bg-ink-800 px-2 py-0.5 text-ink-300">
              IR retido {formatBRL(r.withheld)}
            </span>
          )}
          {/* Day trade nao fica aplicado nem um dia: nao ha Selic para comparar. */}
          {r.swingQty > 0 && (
            <span
              className={`rounded-full px-2 py-0.5 ${beat ? 'bg-go-500/15 text-go-400' : 'bg-fire-500/15 text-fire-400'}`}
            >
              {beat ? '▲' : '▼'} Selic {formatBRL(r.selicGross)}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-fire-400 active:bg-ink-800"
        >
          Apagar
        </button>
      </div>
    </Card>
  )
}

/** Quanto o preco atual esta acima (passou) ou abaixo (falta) de um empate. */
function gapHint(price: number, target: number): string {
  if (!(target > 0)) return 'líquido de IR'
  const gap = (price / target - 1) * 100
  return gap >= 0 ? `✓ passou ${formatPct(gap, 1)}` : `falta ${formatPct(-gap, 1).slice(1)}`
}

function PriceBox({
  label,
  value,
  hint,
  highlight = false,
  tone,
}: {
  label: string
  value: number
  hint: string
  highlight?: boolean
  tone?: 'good' | 'bad'
}) {
  return (
    <div
      className={`rounded-xl px-2 py-2.5 ${highlight ? 'border border-[#d95926]/50 bg-[#d95926]/10' : 'bg-ink-900/60'}`}
    >
      <p className="text-[10px] leading-tight text-ink-400">{label}</p>
      <p
        className={`tnum mt-0.5 text-sm font-black ${
          tone === 'good' ? 'text-go-400' : tone === 'bad' ? 'text-fire-400' : ''
        }`}
      >
        {formatBRL(value)}
      </p>
      <p className="tnum text-[10px] text-ink-500">{hint}</p>
    </div>
  )
}
