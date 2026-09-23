import { useEffect } from 'react'
import { formatClock } from '../lib/stats'
import { notifyRestFinished, useCountdown, useCountdownFeedback } from '../lib/timer'
import { Button } from './ui'

const RADIUS = 120
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Descanso em tela cheia. O anel some no sentido horario e os ultimos 10s
 * ficam laranja: da para saber quanto falta sem ler o numero.
 */
export default function RestTimer({
  endsAt,
  totalSeconds,
  nextLabel,
  nextDetail,
  onAdjust,
  onSkip,
  onDone,
}: {
  endsAt: number
  totalSeconds: number
  nextLabel: string
  nextDetail: string
  onAdjust: (deltaSeconds: number) => void
  onSkip: () => void
  onDone: () => void
}) {
  const remaining = useCountdown(endsAt, onDone)
  useCountdownFeedback(remaining, true)

  // O aviso de sistema so aparece se voce nao estiver olhando a tela.
  useEffect(() => {
    if (remaining > 0) return
    void notifyRestFinished(`${nextLabel} · ${nextDetail}`)
  }, [remaining <= 0, nextLabel, nextDetail])

  const progress = totalSeconds > 0 ? Math.max(0, Math.min(1, remaining / totalSeconds)) : 0
  const urgent = remaining <= 10
  const color = urgent ? '#fb923c' : '#4ade80'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      <div className="safe-t flex items-center justify-center px-4 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">Descanso</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        <div className="relative">
          <svg viewBox="0 0 280 280" className="h-64 w-64 -rotate-90" aria-hidden="true">
            <circle cx="140" cy="140" r={RADIUS} fill="none" stroke="#1f2b3d" strokeWidth="14" />
            <circle
              cx="140"
              cy="140"
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              style={{ transition: 'stroke 200ms linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`tnum text-6xl font-bold leading-none ${urgent ? 'text-fire-400' : 'text-ink-50'}`}
              role="timer"
              aria-live="off"
            >
              {formatClock(remaining)}
            </span>
            <span className="mt-1 text-xs text-ink-400">de {formatClock(totalSeconds)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => onAdjust(-15)}>
            −15s
          </Button>
          <Button variant="ghost" onClick={() => onAdjust(15)}>
            +15s
          </Button>
        </div>
      </div>

      <div className="safe-b px-5 pb-4">
        <div className="rounded-2xl border border-ink-700 bg-ink-850 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">A seguir</p>
          <p className="mt-0.5 truncate font-semibold">{nextLabel}</p>
          <p className="tnum text-sm text-ink-300">{nextDetail}</p>
        </div>
        <Button className="mt-3 w-full" size="lg" variant="go" onClick={onSkip}>
          Pular descanso
        </Button>
      </div>
    </div>
  )
}
