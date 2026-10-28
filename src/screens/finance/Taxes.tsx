import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { GearIcon } from '../../components/finance-ui'
import { Button, Card, EmptyState, Header, Section } from '../../components/ui'
import { formatBRL, formatQuantity, formatSignedBRL } from '../../lib/invest'
import { useApp } from '../../lib/store'
import { KIND_LABEL, type BucketMonth, type MonthTax, type TaxBucket } from '../../lib/taxes'
import { useInvestments } from '../../lib/useInvestments'

/** Codigo da DARF de renda variavel (acoes, ETF, BDR, FII, day trade): pessoa fisica. */
const DARF_CODE = '6015'

const BUCKET_LABEL: Record<TaxBucket, string> = {
  comum: 'Ações, ETF e BDR',
  daytrade: 'Day trade',
  fii: 'FII',
}

const monthName = (month: string) => {
  const text = format(parseISO(`${month}-01`), "MMMM 'de' yyyy", { locale: ptBR })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Impostos e DARF: a apuracao mes a mes, os saldos de prejuizo de cada caixa
 * (que nunca se misturam) e a DARF que precisa ser paga, com codigo e vencimento.
 */
export default function Taxes() {
  const navigate = useNavigate()
  const { settings, saveSettings } = useApp()
  const { apuracao, today, tax } = useInvestments()
  const paid = new Set(settings.finance_darf_paid ?? [])
  const current = today.slice(0, 7)
  const months = [...apuracao.months].reverse()
  const pending = apuracao.months.filter(
    (m) => m.darf > 0 && !paid.has(m.month) && m.month < current,
  )

  const togglePaid = (month: string) => {
    const next = new Set(paid)
    if (next.has(month)) next.delete(month)
    else next.add(month)
    void saveSettings({ finance_darf_paid: [...next].sort() })
  }

  const gear = (
    <button
      type="button"
      onClick={() => navigate('/financeiro/configuracoes')}
      aria-label="Configurar impostos"
      className="rounded-full p-2 text-ink-300 active:bg-ink-800"
    >
      <GearIcon />
    </button>
  )

  if (months.length === 0) {
    return (
      <div>
        <Header title="Impostos e DARF" back="/financeiro" action={gear} />
        <EmptyState
          icon="🧾"
          title="Nenhuma venda ainda"
          description="Quando você registrar vendas, a apuração do mês aparece aqui: isenção, prejuízo acumulado e a DARF a pagar."
        />
      </div>
    )
  }

  return (
    <div className="pb-6">
      <Header title="Impostos e DARF" back="/financeiro" action={gear} />

      {pending.length > 0 && (
        <div className="px-4 pt-4">
          {pending.map((m) => {
            const late = m.dueDate < today
            return (
              <div
                key={m.month}
                className={`mb-2 rounded-2xl border px-3.5 py-3 text-sm ${
                  late
                    ? 'border-fire-500/50 bg-fire-500/10 text-fire-400'
                    : 'border-pr-500/40 bg-pr-500/10 text-pr-400'
                }`}
              >
                <b>
                  DARF de {monthName(m.month)}: {formatBRL(m.darf)}
                </b>
                <span className="block text-[11px]">
                  {late ? 'Venceu em' : 'Vence em'} {format(parseISO(m.dueDate), 'dd/MM/yyyy')} ·
                  código {DARF_CODE}
                  {late && ' — pague com multa e juros (Sicalc, da Receita)'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <Section title="Prejuízo para abater">
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            {(Object.keys(BUCKET_LABEL) as TaxBucket[]).map((bucket) => (
              <div key={bucket} className="rounded-xl bg-ink-900/60 px-2 py-2.5">
                <p className="text-[10px] leading-tight text-ink-400">{BUCKET_LABEL[bucket]}</p>
                <p className="tnum mt-0.5 text-sm font-black">
                  {formatBRL(apuracao.losses[bucket])}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
            Cada saldo só abate lucro tributável da mesma caixa e não vence. Lucro isento (ações com
            vendas no mês até {formatBRL(tax.stockExemptionLimit)}) não gasta prejuízo.
            {apuracao.irrfCredit > 0.005 &&
              ` Retenção na fonte ainda não aproveitada: ${formatBRL(apuracao.irrfCredit)}.`}
          </p>
        </Card>
      </Section>

      <Section title="Mês a mês">
        <div className="flex flex-col gap-2.5">
          {months.map((m) => (
            <MonthCard
              key={m.month}
              month={m}
              open={m.month === current}
              limit={tax.stockExemptionLimit}
              paid={paid.has(m.month)}
              onTogglePaid={() => togglePaid(m.month)}
            />
          ))}
        </div>
      </Section>
    </div>
  )
}

function MonthCard({
  month: m,
  open,
  limit,
  paid,
  onTogglePaid,
}: {
  month: MonthTax
  open: boolean
  limit: number
  paid: boolean
  onTogglePaid: () => void
}) {
  const buckets = (Object.keys(BUCKET_LABEL) as TaxBucket[]).filter((b) =>
    m.events.some((e) => e.bucket === b),
  )
  const hasStocks = m.events.some((e) => e.bucket === 'comum' && e.kind === 'acao')
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-black">{monthName(m.month)}</p>
        {open && (
          <span className="rounded-full bg-brand-600/20 px-2 py-0.5 text-[10px] font-bold text-brand-400">
            Em andamento
          </span>
        )}
      </div>

      {hasStocks && (
        <div className="mt-2.5">
          <div className="flex justify-between text-[11px] text-ink-400">
            <span>Vendas de ações</span>
            <span className="tnum">
              {formatBRL(m.stockSales)} / {formatBRL(limit)} ·{' '}
              <b className={m.exempt ? 'text-go-400' : 'text-fire-400'}>
                {m.exempt ? 'isento' : 'tributado'}
              </b>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-800">
            <div
              className={`h-full rounded-full ${m.exempt ? 'bg-go-500' : 'bg-fire-500'}`}
              style={{ width: `${Math.min(100, (m.stockSales / limit) * 100)}%` }}
            />
          </div>
          {m.exemptGain > 0 && (
            <p className="tnum mt-1 text-[10px] text-go-400">
              {formatBRL(m.exemptGain)} de lucro em ações sem imposto
            </p>
          )}
        </div>
      )}

      {buckets.map((b) => (
        <BucketRow key={b} label={BUCKET_LABEL[b]} bucket={m[b]} />
      ))}

      {m.fixedIncomeWithheld > 0 && (
        <p className="tnum mt-2 text-[11px] text-ink-400">
          Renda fixa: {formatBRL(m.fixedIncomeWithheld)} de IR/IOF já retidos no resgate.
        </p>
      )}

      {buckets.length > 0 && (
        <div className="mt-3 border-t border-ink-700 pt-3">
          <dl className="tnum grid grid-cols-2 gap-y-1 text-xs">
            <dt className="text-ink-400">Imposto do mês</dt>
            <dd className="text-right font-bold">{formatBRL(m.tax)}</dd>
            {m.irrf > 0.005 && (
              <>
                <dt className="text-ink-400">Retido na fonte</dt>
                <dd className="text-right">− {formatBRL(m.irrf)}</dd>
              </>
            )}
            {m.irrfCreditUsed > 0.005 && (
              <>
                <dt className="text-ink-400">Retenção de meses antes</dt>
                <dd className="text-right">− {formatBRL(m.irrfCreditUsed)}</dd>
              </>
            )}
            {m.carriedIn > 0.005 && (
              <>
                <dt className="text-ink-400">DARF pequena de antes</dt>
                <dd className="text-right">+ {formatBRL(m.carriedIn)}</dd>
              </>
            )}
          </dl>

          {m.darf > 0 ? (
            <div
              className={`mt-3 rounded-xl border px-3 py-2.5 ${paid ? 'border-go-500/40 bg-go-500/10' : 'border-pr-500/40 bg-pr-500/10'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-ink-400">
                    DARF {DARF_CODE}
                  </p>
                  <p className="tnum text-lg font-black">{formatBRL(m.darf)}</p>
                </div>
                <Button
                  size="sm"
                  variant={paid ? 'outline' : 'primary'}
                  onClick={onTogglePaid}
                  disabled={open}
                >
                  {paid ? '✓ Paga' : 'Marcar paga'}
                </Button>
              </div>
              <p className="tnum mt-1 text-[11px] text-ink-300">
                Apuração {format(parseISO(`${m.month}-01`), 'MM/yyyy')} · vence{' '}
                {format(parseISO(m.dueDate), 'dd/MM/yyyy')}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
                Gere no Sicalc (Receita) ou no app da corretora com o código {DARF_CODE}.
                {open && ' O mês ainda não fechou: o valor pode mudar até o fim dele.'}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-ink-400">
              {m.carriedOut > 0.005
                ? `${formatBRL(m.carriedOut)} ficou abaixo de R$ 10: soma na DARF do mês seguinte.`
                : 'Sem DARF neste mês.'}
            </p>
          )}
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-ink-400">
          {m.events.length} {m.events.length === 1 ? 'operação' : 'operações'}
        </summary>
        <ul className="mt-1.5 flex flex-col gap-1">
          {m.events.map((e, i) => (
            <li key={i} className="tnum flex justify-between gap-2 text-[11px]">
              <span className="text-ink-300">
                {format(parseISO(e.date), 'dd/MM')} · {e.asset}{' '}
                <span className="text-ink-500">
                  {e.bucket === 'daytrade' ? 'day trade' : KIND_LABEL[e.kind]} ·{' '}
                  {formatBRL(e.saleValue)}
                </span>
              </span>
              <span className={e.gain >= 0 ? 'text-go-400' : 'text-fire-400'}>
                {formatSignedBRL(e.gain)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}

function BucketRow({ label, bucket: b }: { label: string; bucket: BucketMonth }) {
  return (
    <div className="mt-2.5 rounded-xl bg-ink-900/60 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold">{label}</span>
        <span
          className={`tnum text-xs font-bold ${b.result >= 0 ? 'text-go-400' : 'text-fire-400'}`}
        >
          {formatSignedBRL(b.result)}
        </span>
      </div>
      <p className="tnum mt-0.5 text-[10px] leading-relaxed text-ink-400">
        {b.lossUsed > 0.005 && `abateu ${formatBRL(b.lossUsed)} de prejuízo · `}
        {b.taxable > 0.005
          ? `base ${formatBRL(b.taxable)} × ${formatQuantity(b.rate)}% = ${formatBRL(b.tax)}`
          : 'sem imposto'}
        {b.lossAfter > 0.005 && ` · saldo de prejuízo ${formatBRL(b.lossAfter)}`}
      </p>
    </div>
  )
}
