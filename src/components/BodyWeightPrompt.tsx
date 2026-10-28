import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from './ui'
import { putBodyWeightLog } from '../lib/db'
import { formatWeight, parseLocalDate } from '../lib/stats'
import { newId, nowISO, type BodyWeightLog } from '../lib/types'

/**
 * Pergunta do peso do dia, aberta por cima da tela do treino. Dia de treino e
 * o gatilho: ja esta com o app aberto, entao nao tem como esquecer — e dia sem
 * treino fica sem medida, de proposito.
 *
 * No celular: cartao no alto da tela (o teclado sobe por baixo e nao cobre
 * nada), sem foco automatico (o teclado so abre quando voce toca no campo),
 * fundo opaco em vez de desfoque (backdrop-filter em tela cheia deixa a tela
 * preta em varios aparelhos) e campo de texto que aceita virgula.
 */
export default function BodyWeightPrompt({
  lastLog,
  onSaved,
  onSkip,
}: {
  lastLog: BodyWeightLog | null
  onSaved: () => Promise<void>
  onSkip: () => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  // Trava imediata contra toque duplo (o `busy` so muda no proximo render).
  const locked = useRef(false)
  const parsed = Number.parseFloat(value.replace(',', '.'))
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed < 500

  const save = async () => {
    if (!valid || locked.current) return
    locked.current = true
    setBusy(true)
    try {
      await putBodyWeightLog({
        id: newId(),
        user_id: null,
        weight_kg: Math.round(parsed * 10) / 10,
        // Data local (nao UTC): perto da meia-noite, o dia calendario local e
        // o que importa para saber a que dia o registro pertence.
        logged_at: format(new Date(), 'yyyy-MM-dd'),
        updated_at: nowISO(),
      })
      await onSaved()
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  // Portal no body: nenhum container da tela do treino interfere no "fixed".
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="weight-prompt-title"
      className="fixed inset-0 z-[70] overflow-y-auto bg-ink-950/90 px-4 pb-6 pt-[max(4rem,calc(env(safe-area-inset-top)+2rem))]"
    >
      <div className="mx-auto w-full max-w-sm rounded-3xl border border-ink-700 bg-ink-850 p-5 shadow-2xl">
        <p id="weight-prompt-title" className="text-lg font-bold">
          Peso de hoje
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-300">
          {lastLog
            ? `Última medida: ${formatWeight(lastLog.weight_kg)} kg em ${format(parseLocalDate(lastLog.logged_at), "d 'de' MMM", { locale: ptBR })}.`
            : 'Suba na balança antes de começar — a média móvel mostra a tendência real.'}
        </p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <input
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            placeholder="kg"
            aria-label="Peso em kg"
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^\d.,]/g, ''))}
            className="tnum w-28 rounded-xl border border-ink-700 bg-ink-800 px-3 py-3 text-center text-base outline-none focus:border-brand-500"
          />
          <Button type="submit" className="flex-1" size="lg" disabled={busy || !valid}>
            Salvar peso
          </Button>
        </form>
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 w-full py-2 text-sm font-semibold text-ink-400 active:text-ink-200"
        >
          Agora não
        </button>
      </div>
    </div>,
    document.body,
  )
}
