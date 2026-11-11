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
        onClick={() => navigate('/vida/frases')}
        className="block w-full py-1 text-left text-sm italic text-ink-400 active:text-ink-300"
      >
        Guarde aqui as frases que te marcaram ›
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={next}
      aria-label="Frase do momento. Toque para ver outra."
      className="block w-full py-1 text-left"
    >
      <span key={phrase.id} className="animate-rise block whitespace-pre-line text-[15px] italic leading-snug text-ink-300">
        “{phrase.text}”
      </span>
      {phrase.author && (
        <span className="mt-0.5 block text-xs text-ink-400">— {phrase.author}</span>
      )}
    </button>
  )
}
