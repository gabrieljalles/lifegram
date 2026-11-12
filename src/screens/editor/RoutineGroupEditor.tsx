import { useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button, Card, EmptyState, Header, Section, WeekdayPicker } from '../../components/ui'
import { putRoutine, putRoutineGroup } from '../../lib/db'
import { confirmDialog } from '../../lib/dialog'
import { lastDoneByRoutine, membersOf, nextInGroup } from '../../lib/plan'
import { useApp } from '../../lib/store'
import {
  WEEKDAYS,
  newId,
  nowISO,
  type Routine,
  type RoutineGroup,
  type Weekday,
} from '../../lib/types'

/**
 * Grupo de rodizio: nome, dias e os treinos que se revezam. Nos dias do
 * grupo o app recomenda o treino dele feito ha mais tempo.
 */
export default function RoutineGroupEditor() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { routineGroups, routines, routineExercises, sessions, settings, reload } = useApp()
  const group = routineGroups.find((g) => g.id === groupId)

  if (!group) {
    return (
      <div>
        <Header title="Grupo" back="/treinos" />
        <EmptyState icon="🔍" title="Grupo não encontrado" />
      </div>
    )
  }

  const members = membersOf(group, routines)
  const last = lastDoneByRoutine(sessions)
  const next = nextInGroup(members, last)
  const loose = routines.filter(
    (r) => !r.archived && !routineGroups.some((g) => g.id === r.group_id),
  )

  const save = async (patch: Partial<RoutineGroup>) => {
    await putRoutineGroup({ ...group, ...patch, updated_at: nowISO() })
    await reload()
  }

  const join = async (routine: Routine) => {
    const position = members.length ? Math.max(...members.map((m) => m.position)) + 1 : 0
    await putRoutine({ ...routine, group_id: group.id, position, updated_at: nowISO() })
    await reload()
  }

  const leave = async (routine: Routine) => {
    await putRoutine({ ...routine, group_id: null, updated_at: nowISO() })
    await reload()
  }

  const create = async () => {
    const id = newId()
    const position = routines.length ? Math.max(...routines.map((r) => r.position)) + 1 : 0
    await putRoutine({
      id,
      user_id: null,
      name: `${group.name} ${members.length + 1}`,
      position,
      scheduled_days: [],
      group_id: group.id,
      archived: false,
      updated_at: nowISO(),
    })
    await reload()
    navigate(`/treinos/${id}`)
  }

  /** Reordena o rodizio trocando com o vizinho e regrava as posicoes em sequencia. */
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= members.length) return
    const list = [...members]
    const [moved] = list.splice(index, 1)
    list.splice(target, 0, moved)
    const base = Math.min(...members.map((m) => m.position))
    await Promise.all(
      list
        .map((r, i) => ({ r, position: base + i }))
        .filter(({ r, position }) => r.position !== position)
        .map(({ r, position }) => putRoutine({ ...r, position, updated_at: nowISO() })),
    )
    await reload()
  }

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Apagar o grupo "${group.name}"?`,
      message: 'Os treinos continuam, só ficam avulsos. O histórico não muda.',
      confirmLabel: 'Apagar grupo',
      danger: true,
    })
    if (!ok) return
    await Promise.all(
      members.map((r) => putRoutine({ ...r, group_id: null, updated_at: nowISO() })),
    )
    await putRoutineGroup({ ...group, archived: true, updated_at: nowISO() })
    await reload()
    navigate('/treinos')
  }

  const days = [...group.scheduled_days].sort((a, b) => a - b)

  return (
    <div className="pb-8">
      <Header title={group.name} subtitle="Grupo de rodízio" back="/treinos" />

      <Section title="Nome do grupo">
        <input
          defaultValue={group.name}
          onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== group.name) void save({ name })
          }}
          placeholder="Academia, Corrida, Abdominal..."
          className="w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500"
        />
      </Section>

      <Section title="Dias do grupo">
        <Card className="p-4">
          <WeekdayPicker
            value={group.scheduled_days}
            onChange={(value: Weekday[]) => void save({ scheduled_days: value })}
            disabled={settings.rest_days}
          />
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-400">
            {days.length === 0
              ? 'Sem dia marcado: o grupo não aparece no Hoje.'
              : days.length === 7
                ? 'Todo dia, um treino deste grupo aparece no Hoje.'
                : `Em ${days.map((d) => WEEKDAYS[d].label.slice(0, 3)).join(', ')}, um treino deste grupo aparece no Hoje.`}
          </p>
        </Card>
      </Section>

      <Section
        title={`Rodízio (${members.length})`}
        action={
          <button
            type="button"
            onClick={() => void create()}
            className="text-xs font-semibold text-brand-400"
          >
            + Novo treino
          </button>
        }
      >
        {members.length === 0 ? (
          <p className="text-sm text-ink-400">
            Nenhum treino ainda. Crie um ou puxe um treino avulso abaixo.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((routine, index) => {
              const count = routineExercises.filter((re) => re.routine_id === routine.id).length
              const at = last.get(routine.id)
              return (
                <Card key={routine.id} className="flex items-center gap-2 p-3">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label={`Subir ${routine.name}`}
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                      className="h-6 w-8 text-ink-400 disabled:opacity-20"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label={`Descer ${routine.name}`}
                      disabled={index === members.length - 1}
                      onClick={() => void move(index, 1)}
                      className="h-6 w-8 text-ink-400 disabled:opacity-20"
                    >
                      ▼
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/treinos/${routine.id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{routine.name}</span>
                      {next?.id === routine.id && (
                        <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          próximo
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-ink-400">
                      {count} {count === 1 ? 'exercício' : 'exercícios'} ·{' '}
                      {at
                        ? `feito ${format(parseISO(at), "d 'de' MMM", { locale: ptBR })}`
                        : 'ainda não feito'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void leave(routine)}
                    aria-label={`Tirar ${routine.name} do grupo`}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-ink-400 active:bg-ink-800"
                  >
                    ✕
                  </button>
                </Card>
              )
            })}
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          O próximo é o que você não faz há mais tempo. Treino nunca feito entra primeiro, na ordem
          da lista.
        </p>
      </Section>

      {loose.length > 0 && (
        <Section title="Puxar treino avulso">
          <div className="flex flex-wrap gap-2">
            {loose.map((routine) => (
              <button
                key={routine.id}
                type="button"
                onClick={() => void join(routine)}
                className="min-h-[40px] rounded-full border border-ink-600 px-3.5 text-sm active:bg-ink-800"
              >
                + {routine.name}
              </button>
            ))}
          </div>
        </Section>
      )}

      <div className="px-4 pt-4">
        <Button variant="danger" className="w-full" onClick={() => void remove()}>
          Apagar grupo
        </Button>
      </div>
    </div>
  )
}
