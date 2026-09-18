import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, ExercisePhoto, Header, MUSCLE_LABEL, Section } from '../../components/ui'
import { putExercise } from '../../lib/db'
import { invalidatePhotoURL, savePhotoLocally, usePhotoURL } from '../../lib/photo'
import { formatClock, formatWeight } from '../../lib/stats'
import { useApp } from '../../lib/store'
import {
  DEFAULT_REP_CEILING,
  DEFAULT_REST_SECONDS,
  DEFAULT_WEIGHT_INCREMENT,
  MUSCLE_GROUPS,
  newId,
  nowISO,
  type Exercise,
  type MuscleGroup,
} from '../../lib/types'

const REST_PRESETS = [45, 60, 90, 120, 180]

export default function ExerciseEditor() {
  const { exerciseId } = useParams()
  const navigate = useNavigate()
  const { exerciseById, reload } = useApp()
  const fileInput = useRef<HTMLInputElement>(null)

  const isNew = exerciseId === 'novo'
  const existing = !isNew && exerciseId ? exerciseById.get(exerciseId) : undefined

  const [name, setName] = useState('')
  const [group, setGroup] = useState<MuscleGroup>('outro')
  const [rest, setRest] = useState(DEFAULT_REST_SECONDS)
  const [notes, setNotes] = useState('')
  const [ceiling, setCeiling] = useState(DEFAULT_REP_CEILING)
  const [increment, setIncrement] = useState(DEFAULT_WEIGHT_INCREMENT)
  const [draft, setDraft] = useState<Exercise | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setGroup(existing.muscle_group)
      setRest(existing.default_rest_seconds)
      setNotes(existing.notes ?? '')
      setCeiling(existing.rep_ceiling ?? DEFAULT_REP_CEILING)
      setIncrement(existing.weight_increment ?? DEFAULT_WEIGHT_INCREMENT)
      setDraft(existing)
    }
  }, [existing?.id, existing?.photo_local_key])

  const photo = usePhotoURL(draft)

  const pickPhoto = async (file: File) => {
    const id = draft?.id ?? existing?.id ?? newId()
    const key = await savePhotoLocally(id, file)
    invalidatePhotoURL(key)
    // Foto nova invalida a copia da nuvem: o sync sobe a versao atualizada.
    setDraft((current) => ({
      ...(current ??
        ({
          id,
          user_id: null,
          name,
          muscle_group: group,
          photo_url: null,
          photo_local_key: null,
          default_rest_seconds: rest,
          rep_ceiling: ceiling,
          weight_increment: increment,
          notes: null,
          archived: false,
          updated_at: nowISO(),
        } as Exercise)),
      id,
      photo_local_key: key,
      photo_url: null,
    }))
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      alert('Dê um nome ao exercício.')
      return
    }
    setSaving(true)
    const id = draft?.id ?? existing?.id ?? newId()
    await putExercise({
      id,
      user_id: existing?.user_id ?? null,
      name: trimmed,
      muscle_group: group,
      photo_url: draft?.photo_url ?? existing?.photo_url ?? null,
      photo_local_key: draft?.photo_local_key ?? existing?.photo_local_key ?? null,
      default_rest_seconds: rest,
      rep_ceiling: ceiling,
      weight_increment: increment,
      notes: notes.trim() || null,
      archived: false,
      updated_at: nowISO(),
    })
    await reload()
    setSaving(false)
    navigate(-1)
  }

  const archive = async () => {
    if (!existing) return
    if (!confirm(`Arquivar "${existing.name}"? O histórico continua nas estatísticas.`)) return
    await putExercise({ ...existing, archived: true, updated_at: nowISO() })
    await reload()
    navigate('/exercicios')
  }

  return (
    <div>
      <Header
        title={isNew ? 'Novo exercício' : 'Editar exercício'}
        back
        action={
          <Button size="sm" variant="go" onClick={save} disabled={saving}>
            Salvar
          </Button>
        }
      />

      <Section title="Foto">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="block w-full overflow-hidden rounded-2xl border border-dashed border-ink-600"
        >
          <ExercisePhoto url={photo} group={group} className="aspect-4/3 w-full" rounded="" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void pickPhoto(file)
            event.target.value = ''
          }}
        />
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-400">
          Tire uma foto do aparelho da sua academia — fica mais fácil identificar na hora do treino.
          A imagem é comprimida e funciona offline.
        </p>
      </Section>

      <Section title="Nome">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Supino reto com barra"
          className="w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500"
        />
      </Section>

      <Section title="Grupo muscular">
        <div className="flex flex-wrap gap-1.5">
          {MUSCLE_GROUPS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setGroup(option)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                group === option ? 'bg-brand-600 text-white' : 'bg-ink-800 text-ink-300'
              }`}
            >
              {MUSCLE_LABEL[option]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Descanso padrão entre séries">
        <div className="flex flex-wrap gap-1.5">
          {REST_PRESETS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => setRest(seconds)}
              className={`tnum rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                rest === seconds ? 'bg-brand-600 text-white' : 'bg-ink-800 text-ink-300'
              }`}
            >
              {formatClock(seconds)}
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] text-ink-400">
          O padrão do app é 1:30. Cada treino pode sobrescrever esse valor por exercício.
        </p>
      </Section>

      <Section title="Progressão">
        <div className="grid grid-cols-2 gap-2">
          <label className="block rounded-xl border border-ink-700 bg-ink-850 p-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Teto de reps
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={ceiling}
              min={1}
              onChange={(event) => setCeiling(Math.max(1, Number(event.target.value) || 1))}
              className="tnum mt-1 w-full bg-transparent text-center text-2xl font-bold outline-none"
            />
          </label>
          <label className="block rounded-xl border border-ink-700 bg-ink-850 p-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Aumento (kg)
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={increment}
              min={0.5}
              step={0.5}
              onChange={(event) =>
                setIncrement(Math.max(0.5, Number(String(event.target.value).replace(',', '.')) || 0.5))
              }
              className="tnum mt-1 w-full bg-transparent text-center text-2xl font-bold outline-none"
            />
          </label>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-400">
          Quando você bater <strong className="tnum text-ink-300">{ceiling}</strong> repetições em{' '}
          <em>todas</em> as séries, o app sugere subir{' '}
          <strong className="tnum text-ink-300">{formatWeight(increment)} kg</strong> na próxima vez
          — é assim que o progresso continua quando aumentar carga fica difícil.
          {group === 'cardio' && ' Exercícios de cardio não recebem essa sugestão.'}
        </p>
        <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-ink-400">
          Ajuste o aumento ao equipamento: barra costuma pular de 2,5 em 2,5 kg (anilha de 1,25 de
          cada lado), halteres de 2 em 2, e máquina de pino de 5 em 5.
        </p>
      </Section>

      <Section title="Observações">
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Ex.: pegada fechada, banco no 3º furo"
          className="w-full resize-none rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500"
        />
      </Section>

      <div className="flex flex-col gap-2 px-4 pb-8 pt-2">
        <Button size="lg" variant="go" onClick={save} disabled={saving}>
          Salvar exercício
        </Button>
        {existing && (
          <Button variant="danger" onClick={archive}>
            Arquivar exercício
          </Button>
        )}
      </div>
    </div>
  )
}
