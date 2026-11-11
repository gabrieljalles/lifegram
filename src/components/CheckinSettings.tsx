import { useState } from 'react'
import { Card, Section } from './ui'
import { checkinTimeOf, factorsOf } from '../lib/checkin'
import { confirmDialog } from '../lib/dialog'
import { useApp } from '../lib/store'
import type { AppSettings, CheckinFactor } from '../lib/types'

const THEMES: Array<{ id: NonNullable<AppSettings['theme']>; label: string; hint: string }> = [
  { id: 'auto', label: 'Automático', hint: 'Papel de dia, capa azul das 19h às 6h' },
  { id: 'dia', label: 'Sempre papel', hint: '' },
  { id: 'noite', label: 'Sempre noite', hint: '' },
]

/**
 * Ajustes do check-in e da aparencia: hora do fechamento do dia e as
 * perguntas da noite. Desligar uma pergunta nao apaga as respostas antigas.
 */
export default function CheckinSettings() {
  const { settings, saveSettings } = useApp()
  const factors = factorsOf(settings)
  const theme = settings.theme ?? 'auto'
  const [newLabel, setNewLabel] = useState('')

  const saveFactors = (next: CheckinFactor[]) => void saveSettings({ checkin_factors: next })

  const toggle = (id: string) =>
    saveFactors(factors.map((f) => (f.id === id ? { ...f, off: !f.off } : f)))

  const rename = (id: string, label: string) =>
    saveFactors(factors.map((f) => (f.id === id ? { ...f, label } : f)))

  const add = () => {
    const label = newLabel.trim()
    if (!label) return
    const id = `custom_${Date.now().toString(36)}`
    saveFactors([
      ...factors,
      { id, label: label.endsWith('?') ? label : `${label}?`, kind: 'bool' },
    ])
    setNewLabel('')
  }

  const remove = async (factor: CheckinFactor) => {
    const ok = await confirmDialog({
      title: `Tirar "${factor.label}" da lista?`,
      message: 'As respostas que você já deu continuam guardadas.',
      confirmLabel: 'Tirar',
      danger: true,
    })
    if (ok) saveFactors(factors.filter((f) => f.id !== factor.id))
  }

  return (
    <>
      <Section title="Aparência">
        <Card className="flex flex-col gap-1 p-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={theme === t.id}
              onClick={() => void saveSettings({ theme: t.id })}
              className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-left ${
                theme === t.id ? 'bg-ink-800 font-bold' : ''
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full border-2 ${
                  theme === t.id ? 'border-brand-400 bg-brand-400' : 'border-ink-400'
                }`}
              />
              <span className="min-w-0 flex-1 text-sm">
                {t.label}
                {t.hint && <span className="block text-xs font-normal text-ink-400">{t.hint}</span>}
              </span>
            </button>
          ))}
        </Card>
      </Section>

      <Section title="Check-in da noite">
        <Card className="p-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            Horário do check-in
            <input
              type="time"
              value={checkinTimeOf(settings)}
              onChange={(e) =>
                e.target.value && void saveSettings({ checkin_time: e.target.value })
              }
              className="tnum rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 font-display text-lg font-bold"
            />
          </label>
          <p className="mt-1 text-xs text-ink-400">Aparece na tela Hoje nesse horário.</p>
        </Card>

        <p className="mt-4 mb-1.5 text-xs text-ink-400">
          Perguntas da parte 2. Toque no texto para renomear.
        </p>
        <Card className="divide-y divide-ink-700">
          {factors.map((factor) => (
            <div key={factor.id} className="flex min-h-[52px] items-center gap-2 px-3">
              <input
                defaultValue={factor.label}
                onBlur={(e) => {
                  const label = e.target.value.trim()
                  if (label && label !== factor.label) rename(factor.id, label)
                }}
                aria-label={`Texto da pergunta ${factor.label}`}
                className={`min-w-0 flex-1 bg-transparent py-2 text-sm outline-none ${
                  factor.off ? 'text-ink-400 line-through' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => toggle(factor.id)}
                aria-pressed={!factor.off}
                className={`min-h-[36px] rounded-full px-3 text-xs font-bold ${
                  factor.off ? 'border border-ink-600 text-ink-400' : 'bg-brand-600 text-white'
                }`}
              >
                {factor.off ? 'Desligada' : 'Ligada'}
              </button>
              {factor.id.startsWith('custom_') && (
                <button
                  type="button"
                  onClick={() => void remove(factor)}
                  aria-label={`Tirar ${factor.label}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink-400 active:bg-ink-800"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <form
            className="flex items-center gap-2 px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nova pergunta de sim ou não"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-ink-400"
            />
            <button
              type="submit"
              disabled={!newLabel.trim()}
              className="min-h-[36px] rounded-full bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-40"
            >
              Adicionar
            </button>
          </form>
        </Card>
      </Section>
    </>
  )
}
