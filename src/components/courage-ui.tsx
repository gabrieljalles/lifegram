import type { ReactNode } from 'react'
import { COURAGE_MAX_SCORE, COURAGE_STATUS_LABEL, type CourageStatus } from '../lib/types'

/**
 * Pecas visuais da escada do medo.
 *
 * A cor segue a nota, nao o sucesso: nota alta e laranja porque assusta, nota
 * 0 e verde porque virou rotina. Ver a escada inteira mudando de cor com o
 * tempo e metade da recompensa desta area.
 */

export const scoreTone = (score: number): { text: string; bg: string; ring: string } => {
  if (score === 0) return { text: 'text-go-400', bg: 'bg-go-500/15', ring: 'border-go-500/40' }
  if (score <= 3) return { text: 'text-aqua-400', bg: 'bg-aqua-500/15', ring: 'border-aqua-500/40' }
  if (score <= 6) return { text: 'text-pr-400', bg: 'bg-pr-500/15', ring: 'border-pr-500/40' }
  return { text: 'text-fire-400', bg: 'bg-fire-500/15', ring: 'border-fire-500/40' }
}

export const SCORE_HINT: Record<number, string> = {
  0: 'Normal, sem desconforto',
  1: 'Coragem em dose pequena',
  2: 'Incomoda um pouco',
  3: 'Dá um friozinho',
  4: 'Preciso me preparar',
  5: 'Evito se puder',
  6: 'Bem desconfortável',
  7: 'Adio sempre',
  8: 'Muito difícil',
  9: 'Quase impensável',
  10: 'Aterrorizante',
}

export function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const tone = scoreTone(score)
  const sizes = {
    sm: 'h-8 w-8 text-sm',
    md: 'h-11 w-11 text-lg',
    lg: 'h-16 w-16 text-3xl',
  }
  return (
    <span
      className={`tnum inline-flex shrink-0 items-center justify-center rounded-2xl border font-extrabold ${tone.bg} ${tone.ring} ${tone.text} ${sizes[size]}`}
      aria-label={`Nota ${score} de ${COURAGE_MAX_SCORE}`}
    >
      {score}
    </span>
  )
}

const STATUS_TONE: Record<CourageStatus, string> = {
  andamento: 'bg-ink-800 text-ink-300',
  reavaliar: 'bg-pr-500/15 text-pr-400',
  normalizado: 'bg-go-500/15 text-go-400',
}

export function StatusChip({ status }: { status: CourageStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[status]}`}
    >
      {COURAGE_STATUS_LABEL[status]}
    </span>
  )
}

/**
 * Seletor de nota de 0 a 10. Onze alvos grandes, em duas linhas, para caber no
 * polegar — registrar uma exposicao precisa caber em poucos toques.
 */
export function ScorePicker({
  value,
  onChange,
  label,
}: {
  value: number | null
  onChange: (score: number) => void
  label: string
}) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5" role="group" aria-label={label}>
        {Array.from({ length: COURAGE_MAX_SCORE + 1 }, (_, score) => {
          const active = value === score
          const tone = scoreTone(score)
          return (
            <button
              key={score}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(score)}
              className={`tnum h-12 rounded-xl border text-base font-bold transition ${
                active
                  ? `${tone.bg} ${tone.ring} ${tone.text} scale-105`
                  : 'border-ink-700 bg-ink-800 text-ink-400'
              }`}
            >
              {score}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 h-4 text-[11px] text-ink-400">
        {value !== null && `${value} — ${SCORE_HINT[value]}`}
      </p>
    </div>
  )
}

/** Barra de progresso da meta semanal: a recompensa visual de bater o número. */
export function GoalBar({
  value,
  target,
  tone = 'brand',
}: {
  value: number
  target: number
  tone?: 'brand' | 'go'
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  const done = target > 0 && value >= target
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-800">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          done ? 'bg-go-500' : tone === 'go' ? 'bg-go-600' : 'bg-brand-500'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/**
 * Aviso de honestidade estatistica. Aparece sempre que um numero e mostrado
 * antes de haver dados suficientes para sustenta-lo.
 */
export function DataWarning({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-[11px] leading-relaxed text-ink-300">
      {children}
    </p>
  )
}

/** Escolha entre opcoes fixas (ambiente, pessoa, energia). */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>
  value: T | null
  onChange: (value: T | null) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            // Tocar de novo limpa: o campo e opcional e voltar atras tem que
            // ser tao facil quanto escolher.
            onClick={() => onChange(active ? null : option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'border-brand-500 bg-brand-600/20 text-brand-300'
                : 'border-ink-700 bg-ink-800 text-ink-400'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Campo de formulario com rotulo — padroniza o espacamento das telas. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="mt-4 first:mt-0">
      <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</label>
      {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-ink-400">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

export const inputClass =
  'w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500'
