import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState, Header, Section } from '../../components/ui'
import { putRoutine, putRoutineGroup } from '../../lib/db'
import { groupOf, lastDoneByRoutine, membersOf, nextInGroup } from '../../lib/plan'
import { useApp } from '../../lib/store'
import { WEEKDAYS, newId, nowISO, type Routine, type Weekday } from '../../lib/types'
import { seedStarterData } from '../../lib/workout'

const shortDays = (days: Weekday[]) =>
  days.length === 7
    ? 'todo dia'
    : [...days]
        .sort((a, b) => a - b)
        .map((day) => WEEKDAYS[day].label.slice(0, 3))
        .join(', ')

export default function RoutineList() {
  const navigate = useNavigate()
  const { routines, routineGroups, routineExercises, sessions, reload } = useApp()
  const [busy, setBusy] = useState(false)

  const last = lastDoneByRoutine(sessions)
  const loose = routines.filter((r) => !groupOf(r, routineGroups))

  const create = async () => {
    setBusy(true)
    const id = newId()
    await putRoutine({
      id,
      user_id: null,
      name: `Treino ${String.fromCharCode(65 + routines.length)}`,
      position: routines.length ? Math.max(...routines.map((r) => r.position)) + 1 : 0,
      scheduled_days: [],
      group_id: null,
      archived: false,
      updated_at: nowISO(),
    })
    await reload()
    setBusy(false)
    navigate(`/treinos/${id}`)
  }

  const createGroup = async () => {
    setBusy(true)
    const id = newId()
    await putRoutineGroup({
      id,
      user_id: null,
      name: `Grupo ${routineGroups.length + 1}`,
      scheduled_days: [],
      position: routineGroups.length ? Math.max(...routineGroups.map((g) => g.position)) + 1 : 0,
      archived: false,
      updated_at: nowISO(),
    })
    await reload()
    setBusy(false)
    navigate(`/treinos/grupo/${id}`)
  }

  const seed = async () => {
    setBusy(true)
    await seedStarterData()
    await reload()
    setBusy(false)
  }

  const routineCard = (routine: Routine, badge?: string) => {
    const count = routineExercises.filter((re) => re.routine_id === routine.id).length
    return (
      <Card
        key={routine.id}
        className="flex items-center gap-3 p-4"
        onClick={() => navigate(`/treinos/${routine.id}`)}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-semibold">{routine.name}</span>
            {badge && (
              <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {badge}
              </span>
            )}
          </p>
          <p className="text-xs text-ink-400">
            {count} {count === 1 ? 'exercício' : 'exercícios'}
            {!routine.group_id &&
              routine.scheduled_days.length > 0 &&
              ` · ${shortDays(routine.scheduled_days)}`}
          </p>
        </div>
        <span className="text-ink-400" aria-hidden="true">
          ›
        </span>
      </Card>
    )
  }

  return (
    <div>
      <Header
        title="Meus treinos"
        subtitle="Grupos de rodízio e treinos avulsos"
        back="/academia"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={createGroup} disabled={busy}>
              + Grupo
            </Button>
            <Button size="sm" onClick={create} disabled={busy}>
              + Treino
            </Button>
          </div>
        }
      />

      {routines.length === 0 && routineGroups.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Nenhum treino ainda"
          description="Crie um treino vazio e adicione exercícios, ou comece com um ABC pronto para editar. Grupos (Academia, Corrida, Abdominal) revezam treinos e recomendam um por dia."
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
        <>
          {routineGroups.map((group) => {
            const members = membersOf(group, routines)
            const next = nextInGroup(members, last)
            return (
              <Section
                key={group.id}
                title={`${group.name} · ${
                  group.scheduled_days.length ? shortDays(group.scheduled_days) : 'sem dia'
                }`}
                action={
                  <button
                    type="button"
                    onClick={() => navigate(`/treinos/grupo/${group.id}`)}
                    className="text-xs font-semibold text-brand-400"
                  >
                    Editar grupo
                  </button>
                }
              >
                {members.length === 0 ? (
                  <Card className="p-4" onClick={() => navigate(`/treinos/grupo/${group.id}`)}>
                    <p className="text-sm text-ink-400">
                      Grupo vazio. Toque para criar ou puxar treinos.
                    </p>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-2">
                    {members.map((r) => routineCard(r, next?.id === r.id ? 'próximo' : undefined))}
                  </div>
                )}
              </Section>
            )
          })}

          {loose.length > 0 && (
            <Section title={routineGroups.length ? 'Avulsos' : 'Treinos'}>
              <div className="flex flex-col gap-2">{loose.map((r) => routineCard(r))}</div>
            </Section>
          )}
        </>
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
