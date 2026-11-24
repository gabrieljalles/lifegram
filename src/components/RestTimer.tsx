import { useEffect, useRef, useState } from 'react'
import { pickPhrase } from '../lib/motivation'
import { formatClock } from '../lib/stats'
import { useApp } from '../lib/store'
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
  const { motivationPhrases } = useApp()
  // Uma frase sua por descanso; tocar troca, sem repetir a que estava na tela.
  const [pick, setPick] = useState(() => ({ seed: Math.random(), last: null as string | null }))
  const phrase = pickPhrase(motivationPhrases, pick.seed, pick.last)
  const shown = useRef<string | null>(null)
  shown.current = phrase?.id ?? null
  const nextPhrase = () => setPick({ seed: Math.random(), last: shown.current })
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

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        {/* Suas frases em cima do relogio: o descanso vira um respiro de cabeca. */}
        {phrase && (
          <button
            type="button"
            onClick={nextPhrase}
            aria-label="Frase do momento. Toque para ver outra."
            className="w-full max-w-sm rounded-2xl border border-brand-500/40 bg-gradient-to-br from-brand-600/20 via-ink-850 to-ink-850 px-5 py-4 text-center active:from-brand-600/30"
          >
            <span aria-hidden="true" className="block font-serif text-4xl leading-[0.5] text-brand-400/70">
              “
            </span>
            <span
              key={phrase.id}
              className="animate-pop-in mt-2 block whitespace-pre-line text-base font-bold leading-snug text-ink-50"
            >
              {phrase.text}
            </span>
            {phrase.author && (
              <span className="mt-1.5 block text-xs font-semibold text-ink-300">— {phrase.author}</span>
            )}
            {motivationPhrases.length > 1 && (
              <span className="mt-2 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                toque para a próxima
              </span>
            )}
          </button>
        )}

        <div className="relative">
          <svg viewBox="0 0 280 280" className={`${phrase ? 'h-52 w-52' : 'h-64 w-64'} -rotate-90`} aria-hidden="true">
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
              className={`tnum ${phrase ? 'text-5xl' : 'text-6xl'} font-bold leading-none ${urgent ? 'text-fire-400' : 'text-ink-50'}`}
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
