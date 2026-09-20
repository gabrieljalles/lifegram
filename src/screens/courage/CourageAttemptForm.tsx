import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Header, Section } from '../../components/ui'
import PRCelebration from '../../components/PRCelebration'
import { ChipSelect, Field, ScoreBadge, ScorePicker, inputClass } from '../../components/courage-ui'
import { attemptsOfGoal, evaluateGoal } from '../../lib/courage'
import {
  completeAttempt,
  refreshNormalized,
  removeAttempt,
  startAttempt,
} from '../../lib/courageActions'
import { useApp } from '../../lib/store'
import {
  COURAGE_PEOPLE,
  COURAGE_PEOPLE_LABEL,
  COURAGE_PLACES,
  COURAGE_PLACE_LABEL,
  type CouragePeople,
  type CouragePlace,
} from '../../lib/types'

const PLACE_OPTIONS = COURAGE_PLACES.map((value) => ({ value, label: COURAGE_PLACE_LABEL[value] }))
const PEOPLE_OPTIONS = COURAGE_PEOPLE.map((value) => ({
  value,
  label: COURAGE_PEOPLE_LABEL[value],
}))
const ENERGY_OPTIONS = ['1', '2', '3', '4', '5'].map((value) => ({ value, label: value }))

/**
 * Registro de uma exposicao, em duas etapas.
 *
 * Etapa 1 (antes): previsao e medo. Etapa 2 (depois): o que aconteceu de fato.
 * Separar as duas no tempo e o ponto todo — previsao lembrada depois do
 * resultado ja vem contaminada por ele, e ai o exagero do medo some do dado.
 */
export default function CourageAttemptForm() {
  const { goalId, attemptId } = useParams()
  const navigate = useNavigate()
  const { courageGoals, courageAttempts, reload } = useApp()

  const existing = courageAttempts.find((a) => a.id === attemptId) ?? null
  const goal = courageGoals.find((g) => g.id === (existing?.goal_id ?? goalId)) ?? null

  // Com uma previsao em aberto, a tela abre direto na etapa 2.
  const stage: 'previsao' | 'resultado' = existing ? 'resultado' : 'previsao'

  const [predicted, setPredicted] = useState<number | null>(existing?.predicted ?? null)
  const [feared, setFeared] = useState(existing?.feared ?? '')
  const [actual, setActual] = useState<number | null>(existing?.actual ?? null)
  const [happened, setHappened] = useState(existing?.happened ?? '')
  const [ok, setOk] = useState<boolean | null>(existing?.outcome_ok ?? null)
  const [place, setPlace] = useState<CouragePlace | null>(existing?.place ?? null)
  const [people, setPeople] = useState<CouragePeople | null>(existing?.people ?? null)
  const [energy, setEnergy] = useState<string | null>(
    existing?.energy !== null && existing?.energy !== undefined ? String(existing.energy) : null,
  )
  const [note, setNote] = useState(existing?.note ?? '')
  const [full, setFull] = useState(false)
  const [busy, setBusy] = useState(false)
  const [celebrating, setCelebrating] = useState(false)

  if (!goal) {
    return (
      <div>
        <Header title="Tentativa" back="/coragem" />
        <Card className="m-4 p-4 text-sm text-ink-300">Objetivo não encontrado.</Card>
      </div>
    )
  }

  const context = {
    place,
    people,
    energy: energy === null ? null : Number(energy),
  }

  /** Só a previsão: você ainda vai encarar. */
  const savePrediction = async () => {
    if (predicted === null || busy) return
    setBusy(true)
    try {
      await startAttempt({ goal_id: goal.id, predicted, feared, ...context })
      await reload()
      navigate(`/coragem/${goal.id}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  /** Fecha a tentativa e decide se há comemoração. */
  const saveResult = async () => {
    if (actual === null || ok === null || busy) return
    setBusy(true)
    try {
      const attempt =
        existing ??
        (await startAttempt({
          goal_id: goal.id,
          predicted: predicted as number,
          feared,
          ...context,
        }))
      await completeAttempt(attempt, {
        actual,
        happened,
        outcome_ok: ok,
        note: note || null,
        ...context,
      })

      const justNormalized = await refreshNormalized(goal)
      await reload()

      if (justNormalized) {
        setCelebrating(true)
        return
      }
      navigate(`/coragem/${goal.id}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    if (!existing || busy) return
    if (!confirm('Excluir este registro? Ele sai das médias e dos gráficos.')) return
    setBusy(true)
    try {
      await removeAttempt(existing.id)
      await refreshNormalized(goal)
      await reload()
      navigate(`/coragem/${goal.id}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  const evaluation = evaluateGoal(goal, attemptsOfGoal(courageAttempts, goal.id))

  return (
    <div>
      {celebrating && (
        <PRCelebration
          label="Virou rotina!"
          detail={`"${goal.name}" está normalizado`}
          onDone={() => navigate(`/coragem/${goal.id}`, { replace: true })}
        />
      )}

      <Header
        title={stage === 'previsao' ? 'Antes de encarar' : 'Como foi de fato'}
        subtitle={goal.name}
        back={`/coragem/${goal.id}`}
      />

      {stage === 'resultado' && existing && (
        <Section title="Sua previsão">
          <Card className="flex items-center gap-3 p-4">
            <ScoreBadge score={existing.predicted} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-400">Você previu</p>
              <p className="text-sm leading-relaxed text-ink-200">
                {existing.feared || 'sem anotação do que temia'}
              </p>
            </div>
          </Card>
        </Section>
      )}

      {stage === 'previsao' && (
        <Section title="Previsão">
          <Card className="p-4">
            <Field
              label="Quanto você acha que vai ser difícil"
              hint="Chute agora, antes de fazer. É esse número que os dados vão confrontar."
            >
              <ScorePicker value={predicted} onChange={setPredicted} label="Nota prevista" />
            </Field>

            <Field label="O que você teme que aconteça">
              <textarea
                value={feared}
                onChange={(event) => setFeared(event.target.value)}
                rows={2}
                placeholder="Que ela ache estranho e o clima fique ruim"
                className={inputClass}
              />
            </Field>
          </Card>
        </Section>
      )}

      {(stage === 'resultado' || full) && (
        <Section title="Resultado">
          <Card className="p-4">
            <Field label="Quanto foi difícil de verdade" hint="Logo depois, com a memória fresca.">
              <ScorePicker value={actual} onChange={setActual} label="Nota real" />
            </Field>

            <Field label="O que aconteceu de fato">
              <textarea
                value={happened}
                onChange={(event) => setHappened(event.target.value)}
                rows={2}
                placeholder="Ela agradeceu e seguimos conversando"
                className={inputClass}
              />
            </Field>

            <Field
              label="O resultado foi ok?"
              hint="Pelos fatos, não pela sensação do dia: ninguém foi hostil, nada desabou."
            >
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant={ok === true ? 'go' : 'outline'}
                  onClick={() => setOk(true)}
                >
                  Sim, ok
                </Button>
                <Button
                  className="flex-1"
                  variant={ok === false ? 'danger' : 'outline'}
                  onClick={() => setOk(false)}
                >
                  Não
                </Button>
              </div>
            </Field>

            <Field label="Observação (opcional)">
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Algo que não cabe nas categorias"
                className={inputClass}
              />
            </Field>
          </Card>
        </Section>
      )}

      <Section title="Contexto (opcional)">
        <Card className="p-4">
          <Field label="Ambiente">
            <ChipSelect
              options={PLACE_OPTIONS}
              value={place}
              onChange={setPlace}
              label="Ambiente"
            />
          </Field>
          <Field label="Tipo de pessoa">
            <ChipSelect
              options={PEOPLE_OPTIONS}
              value={people}
              onChange={setPeople}
              label="Tipo de pessoa"
            />
          </Field>
          <Field label="Nível de energia" hint="1 é exausto, 5 é a todo vapor.">
            <ChipSelect
              options={ENERGY_OPTIONS}
              value={energy}
              onChange={setEnergy}
              label="Nível de energia"
            />
          </Field>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
            Estes três campos alimentam a análise de padrões, que abre a partir de 15 tentativas
            completas e mostra onde você costuma ir melhor.
          </p>
        </Card>
      </Section>

      <div className="flex flex-col gap-2 px-4 pb-8 pt-2">
        {stage === 'resultado' || full ? (
          <Button
            size="lg"
            variant="go"
            onClick={() => void saveResult()}
            disabled={
              busy || actual === null || ok === null || (stage === 'previsao' && predicted === null)
            }
          >
            Salvar tentativa
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              variant="primary"
              onClick={() => void savePrediction()}
              disabled={busy || predicted === null}
            >
              Salvar previsão e ir encarar
            </Button>
            <Button variant="outline" onClick={() => setFull(true)} disabled={predicted === null}>
              Já fiz — registrar tudo agora
            </Button>
          </>
        )}
        {existing && (
          <Button variant="danger" onClick={() => void discard()} disabled={busy}>
            Excluir registro
          </Button>
        )}
        <p className="px-1 text-[11px] leading-relaxed text-ink-400">{evaluation.message}</p>
      </div>
    </div>
  )
}
