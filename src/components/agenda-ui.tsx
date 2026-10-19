import { useState } from 'react'
import { COMBO_AT, dayKey, relativeLabel, xpOf, type Occurrence } from '../lib/activities'

/**
 * Pecas visuais da agenda: a linha de missao com o check grande e o card da
 * proxima atividade na tela Hoje.
 */

/** "+20 XP" flutuando por cima do botao, por um instante. */
export function XPBurst({ xp }: { xp: number }) {
  return (
    <span
      aria-hidden="true"
      className="animate-xp pointer-events-none absolute -top-2 right-0 text-sm font-black text-pr-400 drop-shadow"
    >
      +{xp} XP
    </span>
  )
}

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
  const [burst, setBurst] = useState(0)
  const xp = xpOf(occ, streak)
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
            <span
              className={`tnum rounded-full px-1.5 py-px ${
                done ? 'bg-go-500/20 text-go-400' : 'bg-pr-500/20 text-pr-400'
              }`}
            >
              +{xp} XP
            </span>
            {streak > 0 && (
              <span className="tnum text-fire-400">
                🔥{streak}
                {streak >= COMBO_AT ? ' x2' : ''}
              </span>
            )}
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
        {burst > 0 && <XPBurst key={burst} xp={xp} />}
        <CheckButton
          done={done}
          disabled={!canCheck}
          label={done ? `Desmarcar ${activity.title}` : `Marcar ${activity.title} como feita`}
          onClick={() => {
            if (!done) setBurst((n) => n + 1)
            onToggle()
          }}
        />
      </span>
    </div>
  )
}

/** Card da tela Hoje: a proxima coisa da agenda, com o check a um toque. */
export function NextActivityCard({
  occ,
  streak,
  now,
  todayLeft,
  onDone,
  onOpen,
}: {
  occ: Occurrence
  streak: number
  now: Date
  /** Quantas atividades de hoje ainda estao em aberto (inclui esta). */
  todayLeft: number
  onDone: () => void
  onOpen: () => void
}) {
  const [burst, setBurst] = useState(0)
  const isToday = occ.day === dayKey(now)
  const xp = xpOf(occ, streak)
  const soon = isToday && occ.at && occ.at.getTime() - now.getTime() < 15 * 60_000

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 p-3.5 ${
        occ.late
          ? 'border-fire-500/60 bg-fire-500/10'
          : soon
            ? 'animate-glow border-brand-400 bg-brand-600/15'
            : 'border-aqua-500/50 bg-aqua-500/10'
      }`}
    >
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 text-left">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-950/50 text-3xl"
        >
          {occ.activity.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={`text-[10px] font-black uppercase tracking-widest ${
                occ.late ? 'text-fire-400' : 'text-aqua-400'
              }`}
            >
              Próxima atividade
            </span>
            <span className="tnum rounded-full bg-pr-500/20 px-1.5 py-px text-[10px] font-black text-pr-400">
              +{xp} XP
            </span>
            {streak > 0 && <span className="tnum text-[11px] font-black text-fire-400">🔥{streak}</span>}
          </span>
          <span className="mt-0.5 block truncate text-lg font-black">{occ.activity.title}</span>
          <span className={`block text-xs font-semibold ${occ.late ? 'text-fire-400' : 'text-ink-300'}`}>
            {relativeLabel(occ, now)}
            {isToday && todayLeft > 1 ? ` · mais ${todayLeft - 1} hoje` : ''}
          </span>
        </span>
      </button>
      {isToday && (
        <div className="relative mt-3">
          {burst > 0 && <XPBurst key={burst} xp={xp} />}
          <button
            type="button"
            onClick={() => {
              setBurst((n) => n + 1)
              onDone()
            }}
            className="w-full rounded-xl bg-aqua-500 py-3 text-sm font-black uppercase tracking-wide text-ink-950 shadow-[0_0_18px_rgba(52,211,166,0.35)] active:bg-aqua-400"
          >
            ✓ Feito
          </button>
        </div>
      )}
    </div>
  )
}
