import type { Occurrence } from '../lib/activities'

/**
 * Pecas visuais da agenda: a linha do item com o check grande.
 */

export function CheckButton({
  done,
  disabled,
  onClick,
  label,
}: {
  done: boolean
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={done}
      aria-label={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-lg font-black transition-all active:scale-90 disabled:opacity-40 ${
        done
          ? 'border-go-400 bg-go-500 text-ink-950 shadow-[0_0_14px_rgba(34,197,94,0.55)]'
          : 'border-ink-600 bg-ink-950/40 text-transparent'
      }`}
    >
      ✓
    </button>
  )
}

export function QuestRow({
  occ,
  streak,
  canCheck,
  onToggle,
  onOpen,
}: {
  occ: Occurrence
  streak: number
  /** Dia futuro: da para ver, nao para marcar. */
  canCheck: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const { activity, done, late } = occ

  return (
    <div
      className={`relative flex items-center gap-3 rounded-2xl border-2 p-3 transition-colors ${
        done
          ? 'border-go-500/50 bg-go-500/10'
          : late
            ? 'border-fire-500/50 bg-fire-500/10'
            : 'border-ink-700 bg-ink-850'
      }`}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          aria-hidden="true"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${
            done ? 'bg-go-500/20' : 'bg-ink-950/50'
          }`}
        >
          {activity.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-ink-400">
            <span className="tnum">{activity.time ?? 'Qualquer hora'}</span>
            <span aria-hidden="true">·</span>
            <span>{activity.kind === 'recorrente' ? '🔁' : '📌'}</span>
            {streak > 1 && <span className="tnum text-fire-400">{streak} seguidas</span>}
          </span>
          <span
            className={`mt-0.5 block truncate text-base font-bold ${
              done ? 'text-ink-300 line-through decoration-go-500/70' : ''
            }`}
          >
            {activity.title}
          </span>
          {late && <span className="block text-[11px] font-semibold text-fire-400">Atrasada — ainda dá tempo</span>}
        </span>
      </button>
      <span className="relative">
        <CheckButton
          done={done}
          disabled={!canCheck}
          label={done ? `Desmarcar ${activity.title}` : `Marcar ${activity.title} como feita`}
          onClick={onToggle}
        />
      </span>
    </div>
  )
}
