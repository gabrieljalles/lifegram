import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatWeight, type ProgressionSuggestion } from '../lib/stats'
import type { MuscleGroup } from '../lib/types'

/* ----------------------------------------------------------- cabecalho */

export function Header({
  title,
  subtitle,
  back,
  action,
}: {
  title: string
  subtitle?: string
  back?: boolean | string
  action?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="safe-t sticky top-0 z-30 flex items-center gap-3 border-b border-ink-800 bg-ink-900/90 px-4 pb-3 pt-3 backdrop-blur">
      {back && (
        <button
          type="button"
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          aria-label="Voltar"
          className="-ml-2 rounded-full p-2 text-ink-300 active:bg-ink-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

/* -------------------------------------------------------------- blocos */

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const base = `rounded-2xl border border-ink-700 bg-ink-850 ${className}`
  if (!onClick) return <div className={base}>{children}</div>
  return (
    <button type="button" onClick={onClick} className={`${base} w-full text-left active:bg-ink-800`}>
      {children}
    </button>
  )
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-4 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * Numero solto com rotulo. Valor grande porque a leitura acontece de relance,
 * e o rotulo em texto neutro: a cor fica so nos marcadores de dados.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  tone?: 'default' | 'good' | 'bad'
}) {
  const toneClass =
    tone === 'good' ? 'text-go-400' : tone === 'bad' ? 'text-fire-400' : 'text-ink-50'
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 px-3.5 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`tnum mt-1 text-2xl font-bold leading-none ${toneClass}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-ink-300">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-tight text-ink-400">{hint}</p>}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'go' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  const variants = {
    primary: 'bg-brand-600 text-white active:bg-brand-500',
    go: 'bg-go-600 text-white active:bg-go-500',
    ghost: 'bg-ink-800 text-ink-100 active:bg-ink-700',
    outline: 'border border-ink-600 text-ink-100 active:bg-ink-800',
    danger: 'bg-transparent text-fire-400 active:bg-ink-800',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-4 text-base',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl font-semibold transition-colors disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  )
}

export function EmptyState({
  icon = '🏋️',
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-14 text-center">
      <div className="text-4xl" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-xs text-sm leading-relaxed text-ink-400">{description}</p>}
      {action}
    </div>
  )
}

/* ------------------------------------------------------ grupo muscular */

/** Icone por grupo: identidade por forma, nao por cor (funciona em daltonismo). */
export const MUSCLE_ICON: Record<MuscleGroup, string> = {
  peito: '🫀',
  costas: '🔙',
  pernas: '🦵',
  gluteos: '🍑',
  ombros: '🏔️',
  biceps: '💪',
  triceps: '🔻',
  abdomen: '🧊',
  panturrilha: '🦶',
  cardio: '❤️‍🔥',
  outro: '⚙️',
}

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  peito: 'Peito',
  costas: 'Costas',
  pernas: 'Pernas',
  gluteos: 'Glúteos',
  ombros: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  abdomen: 'Abdômen',
  panturrilha: 'Panturrilha',
  cardio: 'Cardio',
  outro: 'Outro',
}

export function MuscleChip({ group }: { group: MuscleGroup }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-medium text-ink-300">
      <span aria-hidden="true">{MUSCLE_ICON[group]}</span>
      {MUSCLE_LABEL[group]}
    </span>
  )
}

/** Foto do exercicio, com o icone do grupo quando ainda nao ha imagem. */
export function ExercisePhoto({
  url,
  group,
  className = '',
  rounded = 'rounded-2xl',
}: {
  url: string | null
  group: MuscleGroup
  className?: string
  rounded?: string
}) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`${rounded} ${className} object-cover`}
        loading="lazy"
        decoding="async"
      />
    )
  }
  return (
    <div
      className={`${rounded} ${className} flex items-center justify-center bg-ink-800 text-ink-400`}
      aria-hidden="true"
    >
      <span className="text-[2.5em] leading-none opacity-70">{MUSCLE_ICON[group]}</span>
    </div>
  )
}

/* ------------------------------------------------------------- delta % */

/** Variacao sempre com sinal + seta: a direcao nao depende so da cor. */
export function Delta({ percent, suffix = '' }: { percent: number; suffix?: string }) {
  const rounded = Math.round(percent)
  if (!Number.isFinite(rounded) || rounded === 0) {
    return <span className="tnum text-xs font-semibold text-ink-400">sem variação{suffix}</span>
  }
  const up = rounded > 0
  return (
    <span
      className={`tnum inline-flex items-center gap-0.5 text-xs font-semibold ${
        up ? 'text-go-400' : 'text-fire-400'
      }`}
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {up ? '+' : ''}
      {rounded}%{suffix}
    </span>
  )
}

/* ---------------------------------------------------- recomendacao de carga */

const PROGRESSION_META: Record<
  ProgressionSuggestion['action'],
  { icon: string; title: string; border: string; bg: string; text: string; button: string }
> = {
  increase: {
    icon: '🔺',
    title: 'Hora de subir a carga',
    border: 'border-pr-500/50',
    bg: 'bg-pr-500/10',
    text: 'text-pr-400',
    button: 'bg-pr-500 text-ink-950 active:bg-pr-400',
  },
  decrease: {
    icon: '🔻',
    title: 'Considere baixar a carga',
    border: 'border-fire-500/50',
    bg: 'bg-fire-500/10',
    text: 'text-fire-400',
    button: 'bg-fire-500 text-ink-950 active:bg-fire-400',
  },
  deload: {
    icon: '🧊',
    title: 'Progresso estagnado — que tal um treino mais leve?',
    border: 'border-brand-500/50',
    bg: 'bg-brand-600/10',
    text: 'text-brand-400',
    button: 'bg-brand-600 text-white active:bg-brand-500',
  },
}

/**
 * Card de recomendacao de carga (subir, baixar ou destravar um plato).
 * `onApply` e opcional: no historico do exercicio a recomendacao e so
 * informativa, e so ganha o botao de aplicar dentro do treino ativo.
 */
export function ProgressionCard({
  suggestion,
  onApply,
}: {
  suggestion: ProgressionSuggestion
  onApply?: () => void
}) {
  const meta = PROGRESSION_META[suggestion.action]
  return (
    <div className={`rounded-2xl border ${meta.border} ${meta.bg} px-3.5 py-3`}>
      <p className={`flex items-center gap-1.5 text-xs font-bold ${meta.text}`}>
        <span aria-hidden="true">{meta.icon}</span> {meta.title}
      </p>
      <p className="tnum mt-1 text-[11px] leading-relaxed text-ink-200">{suggestion.reason}</p>
      {onApply && (
        <button
          type="button"
          onClick={onApply}
          className={`tnum mt-2 w-full rounded-xl py-2 text-sm font-bold ${meta.button}`}
        >
          Usar {formatWeight(suggestion.weight)} kg
        </button>
      )}
    </div>
  )
}
