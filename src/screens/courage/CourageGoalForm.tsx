import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, Header, Section } from '../../components/ui'
import { Field, ScorePicker, inputClass } from '../../components/courage-ui'
import { archiveGoal, changeScore, createGoal, updateGoal } from '../../lib/courageActions'
import { useApp } from '../../lib/store'

/**
 * Cadastro e edicao de um degrau. A nota inicial e um chute seu — e exatamente
 * esse chute que os dados vao confrontar depois.
 */
export default function CourageGoalForm() {
  const { goalId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { courageGoals, reload } = useApp()

  const editing = courageGoals.find((g) => g.id === goalId) ?? null
  const parentId = params.get('pai')
  const parent = courageGoals.find((g) => g.id === parentId) ?? null

  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [score, setScore] = useState<number>(editing?.score ?? 3)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const scoreChanged = editing !== null && score !== editing.score
  const siblings = useMemo(
    () => courageGoals.filter((g) => g.parent_id === (parentId ?? null)).length,
    [courageGoals, parentId],
  )

  const save = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      if (editing) {
        await updateGoal(editing, { name, description: description || null })
        // Mudanca de nota nunca e silenciosa: vira uma linha no historico, com
        // o motivo que voce escreveu.
        if (scoreChanged) {
          await changeScore(editing, score, reason || 'ajuste manual')
        }
        await reload()
        navigate(`/coragem/${editing.id}`, { replace: true })
      } else {
        const goal = await createGoal({
          name,
          description: description || null,
          score,
          parent_id: parentId,
          position: siblings,
        })
        await reload()
        navigate(`/coragem/${goal.id}`, { replace: true })
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    if (!confirm(`Arquivar "${editing.name}"? O histórico de tentativas é mantido.`)) return
    await archiveGoal(editing.id)
    await reload()
    navigate('/coragem', { replace: true })
  }

  return (
    <div>
      <Header
        title={editing ? 'Editar objetivo' : parent ? 'Novo sub-objetivo' : 'Novo objetivo'}
        subtitle={parent ? `Degrau menor de "${parent.name}"` : undefined}
        back={editing ? `/coragem/${editing.id}` : '/coragem'}
      />

      <Section title="O que você quer encarar">
        <Card className="p-4">
          <Field
            label="Nome"
            hint="Uma ação concreta, não um tema. Quanto mais específico, melhor."
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Elogiar a roupa de uma colega de trabalho"
              className={inputClass}
            />
          </Field>

          <Field label="Descrição (opcional)">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="Detalhes que ajudam você a repetir do mesmo jeito"
              className={inputClass}
            />
          </Field>

          <Field
            label="Nota de dificuldade"
            hint="0 já é normal para você. 1 ainda é coragem, em dose pequena."
          >
            <ScorePicker value={score} onChange={setScore} label="Nota de dificuldade" />
          </Field>

          {scoreChanged && (
            <Field label="Motivo da mudança" hint="Fica guardado no histórico de notas.">
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="ajuste manual"
                className={inputClass}
              />
            </Field>
          )}
        </Card>
      </Section>

      <div className="flex flex-col gap-2 px-4 pb-8 pt-2">
        <Button size="lg" variant="go" onClick={() => void save()} disabled={busy || !name.trim()}>
          {editing ? 'Salvar alterações' : 'Criar objetivo'}
        </Button>
        {editing && (
          <Button variant="danger" onClick={() => void remove()}>
            Arquivar objetivo
          </Button>
        )}
      </div>
    </div>
  )
}
