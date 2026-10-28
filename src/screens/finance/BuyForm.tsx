import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { KindPicker } from '../../components/finance-ui'
import { Button, Card, Header, Section } from '../../components/ui'
import { buyAsset, parseDecimal, updateBuy } from '../../lib/investActions'
import { assetKey, formatBRL, kindOf } from '../../lib/invest'
import { useApp } from '../../lib/store'
import { guessKind, type AssetKind } from '../../lib/taxes'

const input =
  'w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500'

/**
 * Comprar ativo: /financeiro/investimentos/comprar(?ativo=PETR4). Com
 * ?editar=<id>, o mesmo formulario corrige uma compra ja lancada.
 */
export default function BuyForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { investmentBuys, reload } = useApp()
  const today = format(new Date(), 'yyyy-MM-dd')

  const editing = investmentBuys.find((b) => b.id === params.get('editar')) ?? null
  const decimal = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 8 })
  const [asset, setAsset] = useState(editing?.asset ?? params.get('ativo') ?? '')
  const [quantity, setQuantity] = useState(editing ? decimal(editing.quantity) : '')
  const [price, setPrice] = useState(editing ? decimal(editing.price) : '')
  const [date, setDate] = useState(editing?.bought_on ?? today)
  const [saving, setSaving] = useState(false)
  // Trava imediata: o estado `saving` so muda no proximo render, e um toque
  // duplo no celular chegava a gravar o mesmo lancamento duas vezes.
  const locked = useRef(false)
  // Escolha explicita vale; sem ela, o tipo que o ativo ja tem ou o palpite pelo nome.
  const [chosenKind, setChosenKind] = useState<AssetKind | null>(editing?.kind ?? null)

  const known = [...new Set(investmentBuys.map((b) => b.asset))].sort()
  const qty = parseDecimal(quantity)
  const unit = parseDecimal(price)
  const key = assetKey(asset)
  const knownKind = investmentBuys.some((b) => b.asset === key) ? kindOf(key, investmentBuys) : null
  const kind = chosenKind ?? knownKind ?? (key ? guessKind(key) : null)
  const valid =
    key.length > 0 && qty > 0 && unit > 0 && Boolean(date) && date <= today && kind !== null
  const back = params.get('ativo')
    ? `/financeiro/investimentos/ativo/${encodeURIComponent(params.get('ativo')!)}`
    : '/financeiro/investimentos'

  const save = async () => {
    if (!valid || locked.current) return
    locked.current = true
    setSaving(true)
    try {
      const draft = { asset, quantity: qty, price: unit, bought_on: date, kind: kind! }
      if (editing) await updateBuy(editing, draft)
      else await buyAsset(draft)
      await reload()
      navigate(back)
    } finally {
      locked.current = false
      setSaving(false)
    }
  }

  return (
    <div className="pb-6">
      <Header
        title={editing ? 'Editar compra' : 'Comprar ativo'}
        back={back}
        action={
          <Button size="sm" onClick={() => void save()} disabled={!valid || saving}>
            Salvar
          </Button>
        }
      />

      <Section title="Ativo">
        <input
          value={asset}
          onChange={(event) => setAsset(event.target.value)}
          placeholder="PETR4, IVVB11, Tesouro Selic 2029…"
          list="known-assets"
          autoCapitalize="characters"
          autoFocus={!asset}
          className={`${input} uppercase`}
        />
        <datalist id="known-assets">
          {known.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {key && (
          <div className="mt-3">
            <KindPicker value={kind} onChange={setChosenKind} />
          </div>
        )}
      </Section>

      <Section title="Compra">
        <Card className="grid grid-cols-2 gap-3 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-300">Quantidade</span>
            <input
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="100"
              className={`${input} tnum`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-300">Preço médio (R$)</span>
            <input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="32,50"
              className={`${input} tnum`}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-300">Data da compra</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value)}
              className={`${input} [color-scheme:dark]`}
            />
          </label>
        </Card>
      </Section>

      <Section title="Resumo">
        <Card className="flex items-center justify-between gap-3 p-4">
          <span className="text-sm text-ink-300">Total investido</span>
          <span className="tnum text-xl font-black">
            {qty > 0 && unit > 0 ? formatBRL(qty * unit) : '—'}
          </span>
        </Card>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          A partir desta data, o mesmo valor passa a render Selic na comparação — dia útil a dia
          útil — para você ver se a compra está batendo a taxa básica.
        </p>
      </Section>

      <div className="px-4 pt-2">
        <Button
          className="w-full"
          size="lg"
          onClick={() => void save()}
          disabled={!valid || saving}
        >
          {editing ? 'Salvar alterações' : 'Registrar compra'}
        </Button>
      </div>
    </div>
  )
}
