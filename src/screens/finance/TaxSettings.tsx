import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Header, Section } from '../../components/ui'
import { formatBRL } from '../../lib/invest'
import { parseDecimal } from '../../lib/investActions'
import { useApp } from '../../lib/store'
import { DEFAULT_TAX_SETTINGS, type FinanceTaxSettings } from '../../lib/taxes'
import { taxSettingsOf } from '../../lib/useInvestments'

const box =
  'rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm outline-none focus:border-brand-500'
const input = `w-full ${box}`

/** Numero com virgula para o campo de texto. */
const show = (value: number) =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 6, useGrouping: false })

type Draft = {
  brackets: Array<{ upToDays: string; rate: string }>
  swingRate: string
  dayTradeRate: string
  fiiRate: string
  stockExemptionLimit: string
  irrfSwingPct: string
  irrfDayTradePct: string
  darfMinimum: string
  selicMultiplier: string
}

const toDraft = (s: FinanceTaxSettings): Draft => ({
  brackets: [...s.fixedIncome]
    .sort((a, b) => (a.upToDays ?? Infinity) - (b.upToDays ?? Infinity))
    .map((b) => ({ upToDays: b.upToDays === null ? '' : String(b.upToDays), rate: show(b.rate) })),
  swingRate: show(s.swingRate),
  dayTradeRate: show(s.dayTradeRate),
  fiiRate: show(s.fiiRate),
  stockExemptionLimit: show(s.stockExemptionLimit),
  irrfSwingPct: show(s.irrfSwingPct),
  irrfDayTradePct: show(s.irrfDayTradePct),
  darfMinimum: show(s.darfMinimum),
  selicMultiplier: show(s.selicMultiplier),
})

/** Rascunho valido vira configuracao; invalido volta null (o botao fica desligado). */
function fromDraft(d: Draft): FinanceTaxSettings | null {
  const num = (text: string) => parseDecimal(text)
  const fixedIncome = d.brackets.map((b) => ({
    upToDays: b.upToDays.trim() === '' ? null : Math.round(num(b.upToDays)),
    rate: num(b.rate),
  }))
  const settings: FinanceTaxSettings = {
    fixedIncome,
    swingRate: num(d.swingRate),
    dayTradeRate: num(d.dayTradeRate),
    fiiRate: num(d.fiiRate),
    stockExemptionLimit: num(d.stockExemptionLimit),
    irrfSwingPct: num(d.irrfSwingPct),
    irrfDayTradePct: num(d.irrfDayTradePct),
    darfMinimum: num(d.darfMinimum),
    selicMultiplier: num(d.selicMultiplier),
  }
  const values = [
    ...fixedIncome.flatMap((b) => [b.rate, b.upToDays ?? 0]),
    settings.swingRate,
    settings.dayTradeRate,
    settings.fiiRate,
    settings.stockExemptionLimit,
    settings.irrfSwingPct,
    settings.irrfDayTradePct,
    settings.darfMinimum,
  ]
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return null
  if (!(settings.selicMultiplier > 0)) return null
  // Exatamente uma faixa sem limite: a de "dali em diante".
  if (fixedIncome.filter((b) => b.upToDays === null).length !== 1) return null
  return settings
}

/** A engrenagem do Financeiro: aliquotas, prazos e limites que entram em todas as contas. */
export default function TaxSettings() {
  const navigate = useNavigate()
  const { settings, saveSettings } = useApp()
  const [draft, setDraft] = useState<Draft>(() => toDraft(taxSettingsOf(settings)))
  const [saving, setSaving] = useState(false)
  const parsed = fromDraft(draft)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setBracket = (i: number, patch: Partial<Draft['brackets'][number]>) =>
    set({ brackets: draft.brackets.map((b, j) => (j === i ? { ...b, ...patch } : b)) })

  const save = async () => {
    if (!parsed || saving) return
    setSaving(true)
    try {
      await saveSettings({ finance_tax: parsed })
      navigate(-1)
    } finally {
      setSaving(false)
    }
  }

  const multiplier = parseDecimal(draft.selicMultiplier)

  const field = (label: string, key: Exclude<keyof Draft, 'brackets'>, suffix: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-ink-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          value={draft[key]}
          onChange={(event) => set({ [key]: event.target.value })}
          className={`${input} tnum`}
        />
        <span className="w-6 shrink-0 text-xs text-ink-400">{suffix}</span>
      </div>
    </label>
  )

  return (
    <div className="pb-6">
      <Header
        title="Configurar financeiro"
        back
        action={
          <Button size="sm" onClick={() => void save()} disabled={!parsed || saving}>
            Salvar
          </Button>
        }
      />

      <Section title="Prêmio por arriscar">
        <Card className="p-4">
          <div className="grid grid-cols-2 items-end gap-3">
            {field('Multiplicador da Selic', 'selicMultiplier', '×')}
            <p className="tnum pb-3 text-sm font-black text-ink-200">
              {multiplier > 0
                ? `= ${(multiplier * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da Selic`
                : '—'}
            </p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
            Bolsa tem risco; a Selic não. Com 1,2 o ativo só "bate" se render 120% da Selic — o
            prêmio que você exige por se arriscar. 1 compara com a Selic pura. A meta também paga o
            IR da renda fixa, para continuar líquido com líquido.
          </p>
        </Card>
      </Section>

      <Section title="Renda fixa e Selic">
        <Card className="p-4">
          <p className="mb-3 text-[11px] leading-relaxed text-ink-400">
            IR pelos dias desde cada aplicação. A Selic da comparação paga isso também — e IOF nos
            primeiros 30 dias.
          </p>
          <div className="flex flex-col gap-2">
            {draft.brackets.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="shrink-0 text-[11px] text-ink-400">até</span>
                <input
                  inputMode="numeric"
                  value={b.upToDays}
                  onChange={(event) => setBracket(i, { upToDays: event.target.value })}
                  placeholder="em diante"
                  aria-label="Até quantos dias"
                  className={`${box} tnum min-w-0 flex-1`}
                />
                <span className="shrink-0 text-[11px] text-ink-400">dias</span>
                <input
                  inputMode="decimal"
                  value={b.rate}
                  onChange={(event) => setBracket(i, { rate: event.target.value })}
                  aria-label="Alíquota"
                  className={`${box} tnum w-16 shrink-0`}
                />
                <span className="shrink-0 text-xs text-ink-400">%</span>
                <button
                  type="button"
                  onClick={() => set({ brackets: draft.brackets.filter((_, j) => j !== i) })}
                  aria-label="Remover faixa"
                  className="shrink-0 rounded-lg px-1.5 py-1 text-fire-400 active:bg-ink-800"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => set({ brackets: [...draft.brackets, { upToDays: '', rate: '' }] })}
            className="mt-2 text-[11px] font-bold text-brand-400"
          >
            + Faixa
          </button>
          <p className="mt-1 text-[10px] text-ink-500">
            Deixe "até" vazio em uma faixa só: a que vale dali em diante.
          </p>
        </Card>
      </Section>

      <Section title="Bolsa">
        <Card className="grid grid-cols-2 gap-3 p-4">
          {field('Ações, ETF e BDR (swing)', 'swingRate', '%')}
          {field('Day trade', 'dayTradeRate', '%')}
          {field('FII', 'fiiRate', '%')}
          {field('Isenção: vendas de ações no mês', 'stockExemptionLimit', 'R$')}
        </Card>
      </Section>

      <Section title="Retenção e DARF">
        <Card className="grid grid-cols-2 gap-3 p-4">
          {field('Dedo-duro (do valor vendido)', 'irrfSwingPct', '%')}
          {field('Retido no day trade (do lucro)', 'irrfDayTradePct', '%')}
          {field('DARF mínima', 'darfMinimum', 'R$')}
        </Card>
      </Section>

      <div className="flex flex-col gap-2 px-4 pt-2">
        {!parsed && (
          <p className="text-[11px] text-fire-400">
            Confira os números: nenhum negativo, e uma faixa da renda fixa sem limite de dias.
          </p>
        )}
        <Button
          className="w-full"
          size="lg"
          onClick={() => void save()}
          disabled={!parsed || saving}
        >
          Salvar
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setDraft(toDraft(DEFAULT_TAX_SETTINGS))}
        >
          Voltar ao padrão da lei
        </Button>
        <p className="text-[10px] leading-relaxed text-ink-500">
          Padrão: Selic pura (1×); renda fixa 22,5% / 20% / 17,5% / 15%; ações 15% com isenção até{' '}
          {formatBRL(DEFAULT_TAX_SETTINGS.stockExemptionLimit)} vendidos no mês; day trade e FII
          20%; dedo-duro 0,005%; day trade retém 1%; DARF abaixo de R$ 10 acumula.
        </p>
      </div>
    </div>
  )
}
