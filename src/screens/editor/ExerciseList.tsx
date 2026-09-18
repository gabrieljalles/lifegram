import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  EmptyState,
  ExercisePhoto,
  Header,
  MuscleChip,
  Section,
} from '../../components/ui'
import { usePhotoURL } from '../../lib/photo'
import { useApp } from '../../lib/store'
import type { Exercise } from '../../lib/types'

export default function ExerciseList() {
  const navigate = useNavigate()
  const { exercises } = useApp()
  const [query, setQuery] = useState('')

  const filtered = exercises.filter((exercise) =>
    exercise.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div>
      <Header
        title="Exercícios"
        subtitle="Foto, grupo muscular e descanso padrão"
        back="/treinos"
        action={
          <Button size="sm" onClick={() => navigate('/exercicios/novo')}>
            + Novo
          </Button>
        }
      />

      {exercises.length === 0 ? (
        <EmptyState
          icon="🏋️"
          title="Nenhum exercício cadastrado"
          description="Cadastre os exercícios que você faz, com foto do aparelho da sua academia para identificar na hora."
          action={
            <Button variant="go" onClick={() => navigate('/exercicios/novo')}>
              Cadastrar exercício
            </Button>
          }
        />
      ) : (
        <>
          <div className="px-4 pt-3">
            <input
              placeholder="Buscar..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <Section title={`${filtered.length} exercícios`}>
            <div className="flex flex-col gap-2">
              {filtered.map((exercise) => (
                <ExerciseRow
                  key={exercise.id}
                  exercise={exercise}
                  onClick={() => navigate(`/exercicios/${exercise.id}`)}
                />
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

function ExerciseRow({ exercise, onClick }: { exercise: Exercise; onClick: () => void }) {
  const photo = usePhotoURL(exercise)
  return (
    <Card className="flex items-center gap-3 p-3" onClick={onClick}>
      <ExercisePhoto
        url={photo}
        group={exercise.muscle_group}
        className="h-12 w-12 shrink-0 text-xs"
        rounded="rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{exercise.name}</p>
        <div className="mt-0.5">
          <MuscleChip group={exercise.muscle_group} />
        </div>
      </div>
      <span className="text-ink-400" aria-hidden="true">
        ›
      </span>
    </Card>
  )
}
