import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { KindTag } from '../../components/finance-ui'
import { Button, Card, Header, Section } from '../../components/ui'
import {
  assetKey,
  availableToSell,
  formatBRL,
  formatQuantity,
  formatSignedBRL,
  previewSale,
} from '../../lib/invest'
import { parseDecimal, sellAsset } from '../../lib/investActions'
import { useApp } from '../../lib/store'
import { useInvestments } from '../../lib/useInvestments'

const input =
  'w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500'

/** Vender ativo: /financeiro/investimentos/vender(?ativo=PETR4). Mostra o imposto antes de salvar. */
export default function SellForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { reload } = useApp()
  const { positions, input: data, today, tax } = useInvestments()

  const [asset, setAsset] = useState(params.get('ativo') ?? positions[0]?.asset ?? '')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(today)
  const [saving, setSaving] = useState(false)

  const key = assetKey(asset)
  const position = positions.find((p) => p.asset === key)
  const qty = parseDecimal(quantity)
  const unit = parseDecimal(price)
  const available = key && date ? availableToSell(data, key, date) : 0
  const valid = qty > 0 && unit > 0 && Boolean(date) && date <= today && qty <= available + 1e-9
  const preview = valid
    ? previewSale(data, { asset: key, quantity: qty, price: unit, sold_on: date })
    : null
  const back = params.get('ativo')
    ? `/financeiro/investimentos/ativo/${encodeURIComponent(params.get('ativo')!)}`
    : '/financeiro/investimentos'

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await sellAsset({ asset: key, quantity: qty, price: unit, sold_on: date })
      await reload()
      navigate(back)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-6">
      <Header
        title="Vender ativo"
        back={back}
        action={
          <Button size="sm" onClick={() => void save()} disabled={!valid || saving}>
            Salvar
          </Button>
        }
      />

      <Section title="Ativo">
        <div className="flex flex-wrap gap-1.5">
          {positions.map((p) => (
            <button
              key={p.asset}
              type="button"
              onClick={() => setAsset(p.asset)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                key === p.asset
                  ? 'border-brand-500 bg-brand-600 text-white'
                  : 'border-ink-700 text-ink-300 active:bg-ink-800'
              }`}
            >
              {p.asset}
            </button>
          ))}
        </div>
        {position && (
          <p className="tnum mt-2 flex items-center gap-1.5 text-[11px] text-ink-400">
            <KindTag kind={position.kind} />
            {formatQuantity(position.quantity)} un. · PM {formatBRL(position.avgPrice)} · hoje{' '}
            {formatBRL(position.price)}
          </p>
        )}
      </Section>

      <Section title="Venda">
        <Card className="grid grid-cols-2 gap-3 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between text-xs font-semibold text-ink-300">
              Quantidade
              <button
                type="button"
                onClick={() => setQuantity(String(available).replace('.', ','))}
                className="text-[11px] font-bold text-brand-400"
              >
                Tudo ({formatQuantity(available)})
              </button>
            </span>
            <input
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="100"
              className={`${input} tnum`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-300">Preço de venda (R$)</span>
            <input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder={position ? position.price.toLocaleString('pt-BR') : '32,50'}
              className={`${input} tnum`}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-300">Data da venda</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value)}
              className={`${input} [color-scheme:dark]`}
            />
          </label>
          {qty > available + 1e-9 && (
            <p className="col-span-2 text-[11px] text-fire-400">
              Nessa data você tinha {formatQuantity(available)} un. para vender.
            </p>
          )}
        </Card>
      </Section>

      {preview && (
        <Section title="Imposto desta venda">
          <Card className="p-4">
            <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
              {preview.dayTradeQty > 0 && (
                <span className="rounded-full bg-pr-500/15 px-2 py-0.5 text-pr-400">
                  Day trade · {formatQuantity(preview.dayTradeQty)} un. · {tax.dayTradeRate}%
                </span>
              )}
              {preview.swingQty > 0 && (
                <span className="rounded-full bg-ink-800 px-2 py-0.5 text-ink-300">
                  {position?.kind === 'renda_fixa' ? 'Resgate' : 'Swing'} ·{' '}
                  {formatQuantity(preview.swingQty)} un.
                </span>
              )}
            </div>

            <dl className="tnum mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-ink-400">Valor da venda</dt>
              <dd className="text-right font-bold">{formatBRL(preview.saleValue)}</dd>
              <dt className="text-ink-400">Lucro bruto</dt>
              <dd
                className={`text-right font-bold ${preview.gain >= 0 ? 'text-go-400' : 'text-fire-400'}`}
              >
                {formatSignedBRL(preview.gain)}
              </dd>
              <dt className="text-ink-400">Imposto a mais</dt>
              <dd className="text-right font-bold">{formatBRL(preview.tax)}</dd>
              <dt className="font-semibold text-ink-200">Lucro líquido</dt>
              <dd
                className={`text-right font-black ${preview.net >= 0 ? 'text-go-400' : 'text-fire-400'}`}
              >
                {formatSignedBRL(preview.net)}
              </dd>
            </dl>

            {position?.kind === 'acao' && preview.swingQty > 0 && (
              <div className="mt-3 border-t border-ink-700 pt-3">
                <div className="flex justify-between text-[11px] text-ink-400">
                  <span>Vendas de ações no mês</span>
                  <span className="tnum">
                    {formatBRL(preview.stockSales)} / {formatBRL(tax.stockExemptionLimit)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className={`h-full rounded-full ${preview.exempt ? 'bg-go-500' : 'bg-fire-500'}`}
                    style={{
                      width: `${Math.min(100, (preview.stockSales / tax.stockExemptionLimit) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
              {explain(preview, position?.kind, tax.stockExemptionLimit)}
            </p>
          </Card>
        </Section>
      )}

      <div className="px-4 pt-2">
        <Button
          className="w-full"
          size="lg"
          onClick={() => void save()}
          disabled={!valid || saving}
        >
          Registrar venda
        </Button>
      </div>
    </div>
  )
}

function explain(
  preview: NonNullable<ReturnType<typeof previewSale>>,
  kind: string | undefined,
  limit: number,
): string {
  if (kind === 'renda_fixa')
    return 'Renda fixa: o IR (pela tabela dos dias de cada aplicação) e o IOF já saem retidos no resgate. Não vai para a DARF.'
  if (preview.dayTradeQty > 0 && preview.swingQty === 0)
    return 'Comprou e vendeu no mesmo dia: day trade não tem isenção e só abate prejuízo de day trade. A corretora retém 1% do lucro, que desconta da DARF.'
  if (kind === 'fii')
    return 'FII: 20% sobre o lucro, sem isenção. Prejuízo de FII só abate lucro de FII.'
  if (kind === 'acao') {
    if (preview.exempt)
      return `As vendas de ações do mês ficam até ${formatBRL(limit)}: o lucro de ações é isento. Um prejuízo aqui ainda entra no saldo para abater lucros tributáveis no futuro.`
    return `As vendas de ações do mês passam de ${formatBRL(limit)}: o lucro de TODAS as vendas comuns do mês é tributado em 15%, menos o prejuízo acumulado. O imposto acima já é a diferença real que esta venda faz.`
  }
  return 'ETF e BDR não têm isenção: 15% sobre o lucro, abatendo o prejuízo acumulado das operações comuns.'
}
