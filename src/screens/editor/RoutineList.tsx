import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState, Header, Section } from '../../components/ui'
import { putRoutine } from '../../lib/db'
import { useApp } from '../../lib/store'
import { newId, nowISO } from '../../lib/types'
import { seedStarterData } from '../../lib/workout'

export default function RoutineList() {
  const navigate = useNavigate()
  const { routines, routineExercises, reload } = useApp()
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    const id = newId()
    await putRoutine({
      id,
      user_id: null,
      name: `Treino ${String.fromCharCode(65 + routines.length)}`,
      position: routines.length,
      archived: false,
      updated_at: nowISO(),
    })
    await reload()
    setBusy(false)
    navigate(`/treinos/${id}`)
  }

  const seed = async () => {
    setBusy(true)
    await seedStarterData()
    await reload()
    setBusy(false)
  }

  return (
    <div>
      <Header
        title="Meus treinos"
        subtitle="Monte a ordem dos exercícios, cargas e descanso"
        action={
          <Button size="sm" onClick={create} disabled={busy}>
            + Novo
          </Button>
        }
      />

      {routines.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Nenhum treino ainda"
          description="Crie um treino vazio e adicione exercícios, ou comece com um ABC pronto para editar."
          action={
            <div className="mt-2 flex flex-col gap-2">
              <Button variant="go" onClick={seed} disabled={busy}>
                Criar ABC de exemplo
              </Button>
              <Button variant="outline" onClick={create} disabled={busy}>
                Criar treino vazio
              </Button>
            </div>
          }
        />
      ) : (
        <Section title="Treinos">
          <div className="flex flex-col gap-2">
            {routines.map((routine) => {
              const count = routineExercises.filter((re) => re.routine_id === routine.id).length
              return (
                <Card
                  key={routine.id}
                  className="flex items-center gap-3 p-4"
                  onClick={() => navigate(`/treinos/${routine.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{routine.name}</p>
                    <p className="text-xs text-ink-400">
                      {count} {count === 1 ? 'exercício' : 'exercícios'}
                    </p>
                  </div>
                  <span className="text-ink-400" aria-hidden="true">
                    ›
                  </span>
                </Card>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="Biblioteca">
        <Card className="flex items-center gap-3 p-4" onClick={() => navigate('/exercicios')}>
          <span className="text-lg" aria-hidden="true">
            🏋️
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Exercícios</p>
            <p className="text-xs text-ink-400">Fotos, grupo muscular e descanso padrão</p>
          </div>
          <span className="text-ink-400" aria-hidden="true">
            ›
          </span>
        </Card>
      </Section>
    </div>
  )
}
