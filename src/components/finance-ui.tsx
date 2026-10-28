import { format, parseISO } from 'date-fns'
import {
  formatBRL,
  formatPct,
  formatQuantity,
  formatSignedBRL,
  type Contribution,
  MATURITY_DAYS,
  type Position,
} from '../lib/invest'
import { KIND_LABEL, type AssetKind } from '../lib/taxes'

/**
 * Pecas da area financeira. Batendo a Selic e verde, perdendo e laranja —
 * sempre com o texto dizendo qual dos dois, nunca so a cor.
 */

export function SelicVerdict({
  beat,
  vsSelic,
  compact = false,
  label = 'Selic',
}: {
  beat: boolean
  vsSelic: number
  compact?: boolean
  /** "Selic" ou, com premio de risco, "meta". */
  label?: string
}) {
  const name = label === 'Selic' ? 'a Selic' : `a ${label.toLowerCase()}`
  return (
    <span
      className={`tnum inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
        compact ? 'text-[10px]' : 'text-xs'
      } ${beat ? 'bg-go-500/15 text-go-400' : 'bg-fire-500/15 text-fire-400'}`}
    >
      <span aria-hidden="true">{beat ? '▲' : '▼'}</span>
      {beat ? `Batendo ${name}` : `Abaixo d${name}`}
      {!compact && ` · ${formatSignedBRL(vsSelic)}`}
    </span>
  )
}

/**
 * Barra de comparacao: o retorno do ativo contra o da Selic no mesmo periodo,
 * lado a lado na mesma escala — os dois liquidos de imposto.
 */
export function ReturnBars({
  returnPct,
  selicPct,
  label = 'Selic',
}: {
  returnPct: number
  selicPct: number
  label?: string
}) {
  const max = Math.max(Math.abs(returnPct), Math.abs(selicPct), 0.01)
  const bar = (value: number, color: string, label: string) => (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-ink-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-800">
        <div
          className={`h-full rounded-full ${color}`}
          style={{
            width: `${Math.max(2, (Math.abs(value) / max) * 100)}%`,
            opacity: value < 0 ? 0.55 : 1,
          }}
        />
      </div>
      <span className="tnum w-16 shrink-0 text-right text-xs font-bold">{formatPct(value)}</span>
    </div>
  )
  return (
    <div className="flex flex-col gap-1.5">
      {bar(returnPct, returnPct >= 0 ? 'bg-[#3987e5]' : 'bg-fire-500', 'Ativo')}
      {bar(selicPct, 'bg-[#d95926]', label)}
    </div>
  )
}

/**
 * Faixa amarela das posicoes com menos de um mes: a rentabilidade ainda pula
 * demais para decidir algo. So a direcao aparece, sem numero para ansiedade.
 */
export function MaturingBanner({ since }: { since: string }) {
  return (
    <p className="rounded-xl border border-yellow-500/50 bg-yellow-500/15 px-3 py-2 text-[11px] font-semibold leading-relaxed text-yellow-300">
      ⏳ Rentabilidade imprecisa: na carteira desde {format(parseISO(since), 'dd/MM')}, menos de{' '}
      {MATURITY_DAYS} dias. Ainda não maturou — espere antes de decidir sobre este ativo.
    </p>
  )
}

/** So a direcao: positivo ou negativo, acima ou abaixo da Selic. */
export function DirectionOnly({
  position: p,
  label = 'Selic',
}: {
  position: Position
  label?: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          p.netResult >= 0 ? 'bg-go-500/15 text-go-400' : 'bg-fire-500/15 text-fire-400'
        }`}
      >
        <span aria-hidden="true">{p.netResult >= 0 ? '▲' : '▼'}</span>
        {p.netResult >= 0 ? 'Positivo' : 'Negativo'}
      </span>
      <SelicVerdict beat={p.beat} vsSelic={p.vsSelic} compact label={label} />
    </div>
  )
}

/**
 * Fundo e borda do card pelo resultado liquido: azul empatou ou passou a
 * Selic; verde neon empatou ou passou a Selic + premio (so com premio ligado).
 */
function cardTone(p: Position, premium: boolean): string {
  if (premium && p.beat)
    return 'border-[#39ff88] bg-[#39ff88]/10 shadow-[0_0_18px_rgba(57,255,136,0.35)] active:bg-[#39ff88]/15'
  if (p.netValue >= p.selicNetPure) return 'border-[#3987e5] bg-[#3987e5]/12 active:bg-[#3987e5]/20'
  return 'border-ink-700 bg-ink-850 active:bg-ink-800'
}

export function PositionCard({
  position,
  onClick,
  label = 'Selic',
  premium = false,
}: {
  position: Position
  onClick: () => void
  label?: string
  /** Ha premio de risco configurado (a meta e a Selic + premio). */
  premium?: boolean
}) {
  const p = position
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-3.5 text-left ${cardTone(p, premium)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-black">
            <span className="truncate">{p.asset}</span>
            <KindTag kind={p.kind} />
          </p>
          <p className="tnum text-[11px] text-ink-400">
            {formatQuantity(p.quantity)} × PM {formatBRL(p.avgPrice)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum font-black">{formatBRL(p.value)}</p>
          {!p.maturing && (
            <>
              <p
                className={`tnum text-xs font-bold ${p.netResult >= 0 ? 'text-go-400' : 'text-fire-400'}`}
              >
                {formatSignedBRL(p.netResult)} ({formatPct(p.returnPct)})
              </p>
              <p className="tnum text-[10px] text-ink-500">
                {p.taxIfSold > 0.005
                  ? `líquido · IR ${formatBRL(p.taxIfSold)}`
                  : 'líquido · sem IR'}
              </p>
            </>
          )}
        </div>
      </div>
      {p.maturing ? (
        <>
          <div className="mt-3">
            <MaturingBanner since={p.heldSince} />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <DirectionOnly position={p} label={label} />
            <span className="tnum text-[11px] text-ink-400">
              {format(parseISO(p.priceDay), 'dd/MM')}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3">
            <ReturnBars returnPct={p.returnPct} selicPct={p.selicPct} label={label} />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <SelicVerdict beat={p.beat} vsSelic={p.vsSelic} compact label={label} />
            <span className="tnum text-[11px] text-ink-400">
              {p.quoted ? 'Cotação' : 'Preço de compra'} {formatBRL(p.price)} ·{' '}
              {format(parseISO(p.priceDay), 'dd/MM')}
            </span>
          </div>
        </>
      )}
    </button>
  )
}

/**
 * Quanto cada ativo puxa a carteira para cima ou para baixo contra a Selic,
 * liquido com liquido. A soma das barras e o resultado condensado: um ativo no
 * vermelho pode ser compensado pelos outros — e a diversificacao na tela.
 */
export function SelicContribution({ rows, total }: { rows: Contribution[]; total: number }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.vsSelic)), 0.01)
  const sorted = [...rows].sort((a, b) => b.vsSelic - a.vsSelic)
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((r) => {
        const width = (Math.abs(r.vsSelic) / max) * 50
        return (
          <div key={r.asset} className="flex items-center gap-2">
            <div className="w-20 shrink-0">
              <p className="truncate text-xs font-bold">{r.asset}</p>
              <p className="tnum text-[10px] text-ink-400">
                {r.weight === null ? 'já realizado' : `${(r.weight * 100).toFixed(0)}% da carteira`}
              </p>
            </div>
            {/* Eixo no meio: esquerda perde da Selic, direita ganha. */}
            <div className="relative h-3 flex-1">
              <span className="absolute inset-y-0 left-1/2 w-px bg-ink-600" aria-hidden="true" />
              <span
                className={`absolute inset-y-0 rounded-full ${r.vsSelic >= 0 ? 'left-1/2 bg-go-500' : 'right-1/2 bg-fire-500'}`}
                style={{ width: `${Math.max(1, width)}%` }}
              />
            </div>
            <span
              className={`tnum w-24 shrink-0 text-right text-xs font-bold ${r.vsSelic >= 0 ? 'text-go-400' : 'text-fire-400'}`}
            >
              {formatSignedBRL(r.vsSelic)}
            </span>
          </div>
        )
      })}
      <div className="mt-1 flex items-center justify-between border-t border-ink-700 pt-2">
        <span className="text-xs font-semibold text-ink-300">Carteira toda vs. Selic</span>
        <span className={`tnum text-sm font-black ${total >= 0 ? 'text-go-400' : 'text-fire-400'}`}>
          {formatSignedBRL(total)}
        </span>
      </div>
    </div>
  )
}

export function KindTag({ kind }: { kind: AssetKind }) {
  return (
    <span className="shrink-0 rounded-md bg-ink-800 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-ink-300">
      {KIND_LABEL[kind]}
    </span>
  )
}

const KIND_HINT: Record<AssetKind, string> = {
  acao: 'Isenta se as vendas de ações no mês ficarem até o limite',
  fii: 'Sempre 20% do lucro, prejuízo em saldo próprio',
  etf: 'Sem isenção: 15% (20% no day trade)',
  bdr: 'Sem isenção: 15% (20% no day trade)',
  renda_fixa: 'IR regressivo pelos dias, retido na fonte',
}

/** Escolha do tipo do ativo: decide como o imposto e calculado. */
export function KindPicker({
  value,
  onChange,
}: {
  value: AssetKind | null
  onChange: (kind: AssetKind) => void
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo do ativo">
        {(Object.keys(KIND_LABEL) as AssetKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={value === kind}
            onClick={() => onChange(kind)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              value === kind
                ? 'border-brand-500 bg-brand-600 text-white'
                : 'border-ink-700 text-ink-300 active:bg-ink-800'
            }`}
          >
            {KIND_LABEL[kind]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        {value ? KIND_HINT[value] : 'Final 11 pode ser FII, ETF ou unit: escolha qual é.'}
      </p>
    </div>
  )
}

/** Capital (com aportes) ou rendimento (so o ganho): o mesmo grafico, duas leituras. */
export function ChartModeToggle({
  gain,
  onChange,
}: {
  gain: boolean
  onChange: (gain: boolean) => void
}) {
  return (
    <div
      className="flex rounded-lg border border-ink-700 p-0.5 text-[11px] font-bold"
      role="tablist"
    >
      {(
        [
          { value: false, label: 'Capital' },
          { value: true, label: 'Rendimento' },
        ] as const
      ).map((option) => (
        <button
          key={option.label}
          type="button"
          role="tab"
          aria-selected={gain === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2 py-0.5 ${
            gain === option.value ? 'bg-ink-700 text-ink-50' : 'text-ink-400'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Engrenagem das configuracoes do Financeiro. */
export const GearIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)
