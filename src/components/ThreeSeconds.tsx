import { useEffect, useState } from 'react'
import { addRejection, setRejectionContext } from '../lib/courageActions'
import { FUNNEL_STAGES } from '../lib/rejections'
import { useApp } from '../lib/store'
import { vibrate } from '../lib/timer'
import { FUNNEL_XP } from '../lib/xp'
import type { FunnelContext, FunnelStage } from '../lib/types'
import { ContextPicker } from './game'

/**
 * Regra dos 3 segundos: o medo precisa de tempo para montar a desculpa.
 * Contar 3-2-1 e ir antes de pensar tira esse tempo dele.
 *
 * Depois do "VAI!", a mesma tela recebe o resultado — o registro ja sai
 * pronto, sem procurar botao em outra tela.
 */

type Phase =
  | { kind: 'count'; n: number }
  | { kind: 'go' }
  | { kind: 'done'; stage: FunnelStage; id: string; context: FunnelContext | null }
  | { kind: 'gaveup' }

const STAGE_TONE: Record<FunnelStage, string> = {
  nao: 'border-red-500/60 bg-red-500/15 text-red-300',
  sim: 'border-fire-500/60 bg-fire-500/15 text-fire-300',
  encontro: 'border-pr-500/60 bg-pr-500/15 text-pr-300',
  sexo: 'border-go-500/60 bg-go-500/15 text-go-300',
}

export default function ThreeSeconds({ onClose }: { onClose: () => void }) {
  const { reload } = useApp()
  const [phase, setPhase] = useState<Phase>({ kind: 'count', n: 3 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (phase.kind !== 'count') return
    vibrate(phase.n === 1 ? 90 : 40)
    const timer = window.setTimeout(() => {
      if (phase.n > 1) setPhase({ kind: 'count', n: phase.n - 1 })
      else {
        vibrate([150, 60, 150])
        setPhase({ kind: 'go' })
      }
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [phase])

  const record = async (stage: FunnelStage) => {
    if (saving) return
    setSaving(true)
    try {
      const item = await addRejection('3 segundos', stage)
      await reload()
      vibrate(stage === 'nao' ? 60 : [120, 60, 220])
      setPhase({ kind: 'done', stage, id: item.id, context: null })
    } finally {
      setSaving(false)
    }
  }

  const pickContext = async (context: FunnelContext) => {
    if (phase.kind !== 'done') return
    setPhase({ ...phase, context })
    await setRejectionContext(phase.id, context)
    await reload()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Regra dos 3 segundos"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink-950/97 px-6 text-center backdrop-blur"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-4 top-4 rounded-full p-2 text-2xl leading-none text-ink-400 active:bg-ink-800"
      >
        ×
      </button>

      {phase.kind === 'count' && (
        <>
          <p className="text-sm font-semibold uppercase tracking-widest text-ink-400">
            Sem pensar. Só vai.
          </p>
          <p
            key={phase.n}
            className="animate-count tnum mt-4 text-[9rem] font-black leading-none text-fire-400"
            style={{ textShadow: '0 0 40px rgba(249,115,22,0.6)' }}
          >
            {phase.n}
          </p>
        </>
      )}

      {phase.kind === 'go' && (
        <div className="animate-pop-in flex w-full max-w-xs flex-col items-center">
          <p
            className="text-7xl font-black tracking-tight text-go-400"
            style={{ textShadow: '0 0 40px rgba(34,197,94,0.6)' }}
          >
            VAI!
          </p>
          <p className="mt-3 text-sm text-ink-300">
            Fala agora. Quando voltar, conta aqui como foi.
          </p>
          <div className="mt-8 grid w-full grid-cols-2 gap-2">
            {FUNNEL_STAGES.map((stage) => (
              <button
                key={stage.id}
                type="button"
                disabled={saving}
                onClick={() => void record(stage.id)}
                className={`rounded-2xl border-2 px-2 py-3 text-sm font-bold transition-transform active:scale-95 disabled:opacity-50 ${STAGE_TONE[stage.id]}`}
              >
                <span className="block text-xl" aria-hidden="true">
                  {stage.icon}
                </span>
                {stage.single}
                <span className="tnum block text-[10px] font-black opacity-80">
                  +{FUNNEL_XP[stage.id]} XP
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPhase({ kind: 'gaveup' })}
            className="mt-4 text-xs font-semibold text-ink-400 underline underline-offset-2"
          >
            Travei, não fui
          </button>
        </div>
      )}

      {phase.kind === 'done' && (
        <div className="animate-pop-in flex w-full max-w-xs flex-col items-center gap-5">
          <p className="text-6xl" aria-hidden="true">
            {FUNNEL_STAGES.find((s) => s.id === phase.stage)!.icon}
          </p>
          <div>
            <p className="tnum text-3xl font-black text-pr-400">+{FUNNEL_XP[phase.stage]} XP</p>
            <p className="mt-1 text-sm text-ink-300">
              {phase.stage === 'nao'
                ? 'Você foi. Era só essa a parte que dependia de você.'
                : 'Os nãos de antes trouxeram você até aqui.'}
            </p>
          </div>
          <ContextPicker value={phase.context} onPick={(c) => void pickContext(c)} />
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-brand-600 py-3.5 text-base font-bold text-white active:bg-brand-500"
          >
            {phase.context ? 'Fechar' : 'Pular'}
          </button>
          <button
            type="button"
            onClick={() => setPhase({ kind: 'count', n: 3 })}
            className="-mt-2 text-xs font-semibold text-fire-400"
          >
            Mais uma! 🔥
          </button>
        </div>
      )}

      {phase.kind === 'gaveup' && (
        <div className="animate-pop-in flex max-w-xs flex-col items-center gap-4">
          <p className="text-5xl" aria-hidden="true">
            🫂
          </p>
          <p className="text-lg font-bold">Tudo bem. Travar faz parte.</p>
          <p className="text-sm text-ink-300">
            O medo ganhou essa rodada, não a luta. Respira e tenta de novo com alguém mais fácil.
          </p>
          <button
            type="button"
            onClick={() => setPhase({ kind: 'count', n: 3 })}
            className="w-full rounded-2xl bg-fire-500 py-3.5 text-base font-bold text-ink-950 active:bg-fire-400"
          >
            Tentar de novo
          </button>
          <button type="button" onClick={onClose} className="text-xs font-semibold text-ink-400">
            Agora não
          </button>
        </div>
      )}
    </div>
  )
}
