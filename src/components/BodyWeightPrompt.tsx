import { useState } from 'react'
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

  const save = async () => {
    const parsed = Number.parseFloat(value.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0 || busy) return
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
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm">
      <div className="safe-b w-full rounded-t-3xl border-t border-ink-700 bg-ink-850 px-5 pt-5">
        <p className="text-lg font-bold">Peso de hoje</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-300">
          {lastLog
            ? `Última medida: ${formatWeight(lastLog.weight_kg)} kg em ${format(parseLocalDate(lastLog.logged_at), "d 'de' MMM", { locale: ptBR })}.`
            : 'Suba na balança antes de começar — a média móvel mostra a tendência real.'}
        </p>
        <div className="mt-4 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            placeholder="kg"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save()
            }}
            className="w-28 rounded-xl border border-ink-700 bg-ink-800 px-3 py-3 text-center text-base outline-none focus:border-brand-500"
          />
          <Button
            className="flex-1"
            size="lg"
            onClick={() => void save()}
            disabled={busy || !value}
          >
            Salvar peso
          </Button>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 w-full py-2 text-sm font-semibold text-ink-400 active:text-ink-200"
        >
          Agora não
        </button>
      </div>
    </div>
  )
}
