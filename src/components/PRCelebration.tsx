import { useEffect, useMemo, useState } from 'react'

const COLORS = ['#3987e5', '#d95926', '#199e70', '#f59e0b', '#9085e9']

interface Piece {
  id: number
  left: number
  delay: number
  duration: number
  color: string
  size: number
  drift: number
}

/**
 * Confete + faixa de recorde. Dura pouco de proposito: a recompensa aparece,
 * o corpo registra e a tela volta para o treino sem atrapalhar a serie.
 */
export default function PRCelebration({
  label,
  detail,
  onDone,
}: {
  label: string
  detail: string
  onDone: () => void
}) {
  const [leaving, setLeaving] = useState(false)

  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: 46 }, (_, id) => ({
        id,
        left: Math.random() * 100,
        delay: Math.random() * 400,
        duration: 1100 + Math.random() * 900,
        color: COLORS[id % COLORS.length],
        size: 6 + Math.random() * 7,
        drift: (Math.random() - 0.5) * 120,
      })),
    [],
  )

  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), 1700)
    const close = window.setTimeout(onDone, 2100)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(close)
    }
  }, [onDone])

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-300 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
      role="status"
      aria-live="polite"
    >
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translate3d(0, -12vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--drift), 105vh, 0) rotate(720deg); opacity: 0.15; }
        }
        @media (prefers-reduced-motion: reduce) {
          .confetti-piece { display: none; }
        }
      `}</style>

      <div className="absolute inset-0 overflow-hidden">
        {pieces.map((piece) => (
          <span
            key={piece.id}
            className="confetti-piece absolute top-0 block rounded-[2px]"
            style={{
              left: `${piece.left}%`,
              width: piece.size,
              height: piece.size * 1.6,
              background: piece.color,
              ['--drift' as string]: `${piece.drift}px`,
              animation: `confetti-fall ${piece.duration}ms cubic-bezier(0.2, 0.7, 0.4, 1) ${piece.delay}ms both`,
            }}
          />
        ))}
      </div>

      <div className="animate-pop-in rounded-3xl border border-pr-500/50 bg-ink-950/90 px-7 py-6 text-center shadow-2xl backdrop-blur">
        <div className="text-4xl" aria-hidden="true">
          🏆
        </div>
        <p className="mt-2 text-xl font-extrabold tracking-tight text-pr-400">{label}</p>
        <p className="tnum mt-1 text-sm text-ink-200">{detail}</p>
      </div>
    </div>
  )
}
