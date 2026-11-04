import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pickPhrase } from '../lib/motivation'
import { useApp } from '../lib/store'

const LAST_KEY = 'motivation:last'

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

/**
 * Uma das suas frases, no topo da tela Hoje. Troca a cada visita: ao abrir o
 * app, ao voltar de outra aba e ao trazer o app de volta do segundo plano —
 * nunca a mesma duas vezes seguidas. Tocar no cartao tambem troca.
 */
export default function MotivationCard() {
  const { motivationPhrases, ready } = useApp()
  const navigate = useNavigate()
  // Sorteio da visita: montar a tela (abrir o app ou voltar da outra aba) ja
  // e uma visita nova.
  const [visit, setVisit] = useState(() => ({ seed: Math.random(), last: readLast() }))
  const phrase = pickPhrase(motivationPhrases, visit.seed, visit.last)
  const shown = useRef<string | null>(null)

  useEffect(() => {
    shown.current = phrase?.id ?? null
    if (!phrase) return
    try {
      localStorage.setItem(LAST_KEY, phrase.id)
    } catch {
      // sem storage: so pode repetir a ultima frase na proxima visita
    }
  }, [phrase])

  const next = () => setVisit({ seed: Math.random(), last: shown.current })

  // App voltando do segundo plano (desbloqueou o celular) tambem e visita nova.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') next()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  if (!ready) return null

  if (!phrase) {
    return (
      <button
        type="button"
        onClick={() => navigate('/coragem/frases')}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-ink-600 bg-ink-850/60 p-3.5 text-left active:bg-ink-800"
      >
        <span className="text-2xl" aria-hidden="true">
          💬
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black">Suas frases aparecem aqui</span>
          <span className="block text-xs text-ink-400">
            Guarde na Coragem as mensagens que te marcaram.
          </span>
        </span>
        <span className="text-sm font-bold text-brand-400">Adicionar ›</span>
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={next}
        aria-label="Frase do momento. Toque para ver outra."
        className="w-full rounded-2xl border border-brand-500/40 bg-gradient-to-br from-brand-600/20 via-ink-850 to-ink-850 py-4 pl-4 pr-11 text-left active:from-brand-600/30"
      >
        <span
          aria-hidden="true"
          className="block font-serif text-4xl leading-[0.5] text-brand-400/70"
        >
          “
        </span>
        <span
          key={phrase.id}
          className="animate-pop-in mt-1 block whitespace-pre-line text-[15px] font-bold leading-snug text-ink-50"
        >
          {phrase.text}
        </span>
        {phrase.author && (
          <span className="mt-1.5 block text-xs font-semibold text-ink-300">— {phrase.author}</span>
        )}
      </button>
      <button
        type="button"
        onClick={() => navigate('/coragem/frases')}
        aria-label="Gerenciar frases"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 active:bg-ink-800"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      </button>
    </div>
  )
}
