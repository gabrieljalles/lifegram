import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Header } from '../../components/ui'
import { CALIBRATION, isCalibrated, PACE_LABEL, pacesFromAnswers } from '../../lib/trackCalibration'
import { CARISMA } from '../../lib/tracks'
import { useApp } from '../../lib/store'

/**
 * Calibracao da trilha: responda pelo que voce faz hoje, nao pelo que gostaria
 * de fazer. Resposta otimista te poe num ponto que ainda assusta.
 *
 * Refazer e seguro: muda so o ritmo dos capitulos, nunca apaga progresso.
 */
export default function CourageCalibrate() {
  const navigate = useNavigate()
  const { settings, saveSettings } = useApp()
  const [answers, setAnswers] = useState<Record<string, number>>(settings.track_answers ?? {})
  const [saving, setSaving] = useState(false)

  const pronto = isCalibrated(answers)
  const paces = pacesFromAnswers(answers)

  const salvar = async () => {
    setSaving(true)
    try {
      await saveSettings({ track_answers: answers })
      navigate('/coragem/mapa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-900">
      <Header title="Calibrar a trilha" subtitle="Responda pelo que você faz hoje" back="/coragem/mapa" />

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <ol className="space-y-4">
          {CALIBRATION.map((q, qi) => (
            <li key={q.id} className="rounded-2xl border border-ink-700 bg-ink-850 p-3.5">
              <p className="text-sm font-semibold leading-snug">
                <span className="tnum mr-1.5 text-ink-500">{qi + 1}.</span>
                {q.question}
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {q.options.map((label, oi) => {
                  const ativo = answers[q.id] === oi
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                      className={`rounded-xl border px-2.5 py-2 text-left text-xs leading-snug transition ${
                        ativo
                          ? 'border-brand-400 bg-brand-600/25 font-semibold text-brand-100'
                          : 'border-ink-700 bg-ink-900 text-ink-300'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ol>

        {/* Previa do resultado: a pessoa ve o que cada resposta faz antes de salvar. */}
        <div className="mt-5 rounded-2xl border border-ink-700 bg-ink-850 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">Como sua trilha fica</p>
          <ul className="mt-2 space-y-1">
            {CARISMA.chapters.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-xs">
                <span className="text-ink-300">
                  {c.icon} {c.name}
                </span>
                <span className={paces[c.id] && paces[c.id] !== 'completo' ? 'text-brand-300' : 'text-ink-500'}>
                  {PACE_LABEL[paces[c.id] ?? 'completo']}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-400">
            Completo: cada nível como está escrito. Rápido: metade das execuções. Teste: antes de começar
            o capítulo, você pode fazer o desafio final dele. Se for fácil, o capítulo fecha.
          </p>
        </div>
      </div>

      <div className="safe-b shrink-0 border-t border-ink-800 bg-ink-900 px-4 pb-3 pt-3">
        <Button className="w-full" size="lg" variant="go" disabled={!pronto || saving} onClick={() => void salvar()}>
          {pronto ? 'Salvar e voltar ao mapa' : `Faltam ${CALIBRATION.length - Object.keys(answers).length} respostas`}
        </Button>
      </div>
    </div>
  )
}
