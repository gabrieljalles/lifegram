import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  EmptyState,
  ExercisePhoto,
  Header,
  MUSCLE_ICON,
  MUSCLE_LABEL,
  Section,
} from '../../components/ui'
import { usePhotoURL } from '../../lib/photo'
import { deleteRoutineExercise, putRoutine, putRoutineExercise } from '../../lib/db'
import { formatClock } from '../../lib/stats'
import { useApp } from '../../lib/store'
import { newId, nowISO, type Exercise, type MuscleGroup, type RoutineExercise } from '../../lib/types'

export default function RoutineEditor() {
  const { routineId } = useParams()
  const navigate = useNavigate()
  const { routines, routineExercises, exercises, exerciseById, reload } = useApp()
  const [picking, setPicking] = useState(false)

  const routine = routines.find((r) => r.id === routineId)
  const items = useMemo(
    () =>
      routineExercises
        .filter((re) => re.routine_id === routineId)
        .sort((a, b) => a.position - b.position),
    [routineExercises, routineId],
  )

  if (!routine) {
    return (
      <div>
        <Header title="Treino" back="/treinos" />
        <EmptyState icon="🔍" title="Treino não encontrado" />
      </div>
    )
  }

  const rename = async (name: string) => {
    await putRoutine({ ...routine, name, updated_at: nowISO() })
    await reload()
  }

  const addExercise = async (exercise: Exercise) => {
    // items.length colide com posicoes existentes depois de qualquer remocao
    // (deixa um buraco), duplicando posicao e travando a reordenacao depois.
    const nextPosition = items.length
      ? Math.max(...items.map((entry) => entry.position)) + 1
      : 0
    await putRoutineExercise({
      id: newId(),
      routine_id: routine.id,
      exercise_id: exercise.id,
      position: nextPosition,
      target_sets: 3,
      target_reps: 10,
      target_weight: 0,
      rest_seconds: null,
      updated_at: nowISO(),
    })
    setPicking(false)
    await reload()
  }

  const update = async (entry: RoutineExercise, patch: Partial<RoutineExercise>) => {
    await putRoutineExercise({ ...entry, ...patch, updated_at: nowISO() })
    await reload()
  }

  /**
   * Troca de posicao com o vizinho: reordenar sem arrastar, que no dedo falha.
   * Reescreve a lista toda como 0..n-1 (nao so troca os dois valores) porque
   * posicoes duplicadas de treinos antigos (bug corrigido em addExercise)
   * faziam a troca virar um no-op — assim qualquer reordenacao ja conserta a
   * lista de uma vez.
   */
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const reordered = [...items]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)

    const writes = reordered
      .map((entry, position) => ({ entry, position }))
      .filter(({ entry, position }) => entry.position !== position)

    await Promise.all(
      writes.map(({ entry, position }) =>
        putRoutineExercise({ ...entry, position, updated_at: nowISO() }),
      ),
    )
    await reload()
  }

  const remove = async (entry: RoutineExercise) => {
    await deleteRoutineExercise(entry.id)
    await reload()
  }

  const archive = async () => {
    if (!confirm(`Remover o treino "${routine.name}"? O histórico das sessões é mantido.`)) return
    await putRoutine({ ...routine, archived: true, updated_at: nowISO() })
    await reload()
    navigate('/treinos')
  }

  return (
    <div>
      <Header
        title={routine.name}
        back="/treinos"
        action={
          <Button size="sm" onClick={() => setPicking(true)}>
            + Exercício
          </Button>
        }
      />

      <Section title="Nome do treino">
        <input
          defaultValue={routine.name}
          onBlur={(event) => void rename(event.target.value.trim() || routine.name)}
          className="w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500"
        />
      </Section>

      <Section title={`Exercícios (${items.length})`}>
        {items.length === 0 ? (
          <EmptyState
            icon="➕"
            title="Treino vazio"
            description="Adicione os exercícios na ordem em que você vai executá-los."
            action={<Button variant="go" onClick={() => setPicking(true)}>Adicionar exercício</Button>}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((entry, index) => (
              <RoutineItem
                key={entry.id}
                entry={entry}
                exercise={exerciseById.get(entry.exercise_id)}
                index={index}
                total={items.length}
                onUpdate={(patch) => void update(entry, patch)}
                onMove={(direction) => void move(index, direction)}
                onRemove={() => void remove(entry)}
              />
            ))}
          </div>
        )}
      </Section>

      <div className="px-4 pb-8 pt-2">
        <Button variant="danger" className="w-full" onClick={archive}>
          Remover treino
        </Button>
      </div>

      {picking && (
        <ExercisePicker
          exercises={exercises}
          onPick={(exercise) => void addExercise(exercise)}
          onClose={() => setPicking(false)}
          onCreate={() => navigate('/exercicios/novo')}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------ item */

function RoutineItem({
  entry,
  exercise,
  index,
  total,
  onUpdate,
  onMove,
  onRemove,
}: {
  entry: RoutineExercise
  exercise: Exercise | undefined
  index: number
  total: number
  onUpdate: (patch: Partial<RoutineExercise>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const photo = usePhotoURL(exercise)
  const rest = entry.rest_seconds ?? exercise?.default_rest_seconds ?? 90

  if (!exercise) return null

  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <ExercisePhoto
          url={photo}
          group={exercise.muscle_group}
          className="h-12 w-12 shrink-0 text-xs"
          rounded="rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{exercise.name}</p>
          <p className="tnum text-[11px] text-ink-400">
            descanso {formatClock(rest)} {entry.rest_seconds === null && '(padrão do exercício)'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-0.5">
          <IconButton label="Subir" disabled={index === 0} onClick={() => onMove(-1)}>
            ▲
          </IconButton>
          <IconButton label="Descer" disabled={index === total - 1} onClick={() => onMove(1)}>
            ▼
          </IconButton>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <NumberField
          label="Séries"
          value={entry.target_sets}
          min={1}
          onChange={(value) => onUpdate({ target_sets: value })}
        />
        <NumberField
          label="Reps"
          value={entry.target_reps}
          min={1}
          onChange={(value) => onUpdate({ target_reps: value })}
        />
        <NumberField
          label="Carga kg"
          value={entry.target_weight}
          min={-1000}
          step={2.5}
          onChange={(value) => onUpdate({ target_weight: value })}
        />
        <NumberField
          label="Desc. s"
          value={rest}
          step={15}
          onChange={(value) => onUpdate({ rest_seconds: value })}
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="mt-2 text-[11px] font-semibold text-fire-400"
      >
        Remover do treino
      </button>
    </Card>
  )
}

function IconButton({
  children,
  onClick,
  label,
  disabled,
}: {
  children: string
  onClick: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="h-6 w-8 rounded-md bg-ink-800 text-[10px] text-ink-300 disabled:opacity-30 active:bg-ink-700"
    >
      {children}
    </button>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  step?: number
}) {
  return (
    <label className="block">
      <span className="block text-center text-[10px] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        defaultValue={value}
        key={value}
        min={min}
        step={step}
        onBlur={(event) => {
          const parsed = Number.parseFloat(event.target.value.replace(',', '.'))
          if (Number.isFinite(parsed)) onChange(Math.max(min, parsed))
        }}
        className="tnum mt-0.5 w-full rounded-lg border border-ink-700 bg-ink-800 py-1.5 text-center text-sm font-semibold outline-none focus:border-brand-500"
      />
    </label>
  )
}

/* ---------------------------------------------------------- seletor */

function ExercisePicker({
  exercises,
  onPick,
  onClose,
  onCreate,
}: {
  exercises: Exercise[]
  onPick: (exercise: Exercise) => void
  onClose: () => void
  onCreate: () => void
}) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<MuscleGroup | null>(null)

  /** So mostra chips de categorias que tem exercicio cadastrado — filtro pra categoria vazia nao serve pra nada. */
  const groupsPresent = useMemo(
    () => [...new Set(exercises.map((exercise) => exercise.muscle_group))],
    [exercises],
  )

  const filtered = exercises.filter(
    (exercise) =>
      exercise.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!group || exercise.muscle_group === group),
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950/95 backdrop-blur">
      <div className="safe-t flex items-center gap-2 px-4 pb-2 pt-4">
        <input
          autoFocus
          placeholder="Buscar exercício..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="flex-1 rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
        />
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      </div>

      <div className="flex items-center gap-1.5 px-4 pb-3">
        {/* Fica fora da area com scroll: com muitas categorias, "limpar" nao pode
            depender de rolar a fila toda ate o fim para ser alcancado. */}
        {group && (
          <button
            type="button"
            onClick={() => setGroup(null)}
            className="shrink-0 rounded-full bg-ink-800 px-3 py-1.5 text-xs font-semibold text-fire-400 active:bg-ink-700"
          >
            ✕ Limpar
          </button>
        )}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {groupsPresent.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setGroup((current) => (current === option ? null : option))}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                group === option ? 'bg-brand-600 text-white' : 'bg-ink-800 text-ink-300'
              }`}
            >
              {MUSCLE_LABEL[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-400">Nenhum exercício encontrado.</p>
        )}
        <div className="flex flex-col gap-1.5">
          {filtered.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onPick(exercise)}
              className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-left active:bg-ink-800"
            >
              <span aria-hidden="true">{MUSCLE_ICON[exercise.muscle_group]}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{exercise.name}</span>
            </button>
          ))}
        </div>
        <Button variant="outline" className="mt-3 w-full" onClick={onCreate}>
          + Criar novo exercício
        </Button>
      </div>
    </div>
  )
}
