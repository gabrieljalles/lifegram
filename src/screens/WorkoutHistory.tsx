import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { EmptyState, Header, Section } from '../components/ui'
import { deleteSession } from '../lib/db'
import { confirmDialog } from '../lib/dialog'
import { formatDuration, formatVolume } from '../lib/stats'
import { useApp } from '../lib/store'
import type { Session } from '../lib/types'

/**
 * Todos os treinos ja feitos, do mais recente ao mais antigo. Serve para
 * rever um treino e para tirar do estudo aquele que nao deveria contar
 * (comecou mal, parou no meio).
 */
export default function WorkoutHistory() {
  const { sessions, setLogs, active, reload } = useApp()

  const setsBySession = useMemo(() => {
    const map = new Map<string, number>()
    for (const log of setLogs) map.set(log.session_id, (map.get(log.session_id) ?? 0) + 1)
    return map
  }, [setLogs])

  /** Por mes. Sessao vazia e nunca terminada e so resto de um toque errado: fica de fora. */
  const months = useMemo(() => {
    const groups: Array<{ label: string; items: Session[] }> = []
    const list = sessions
      .filter((s) => s.id !== active?.session_id)
      .filter((s) => s.finished_at || setsBySession.has(s.id))
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
    for (const session of list) {
      const label = format(parseISO(session.started_at), "MMMM 'de' yyyy", { locale: ptBR })
      const last = groups[groups.length - 1]
      if (last?.label === label) last.items.push(session)
      else groups.push({ label, items: [session] })
    }
    return groups
  }, [sessions, setsBySession, active?.session_id])

  const remove = async (session: Session) => {
    const when = format(parseISO(session.started_at), "d 'de' MMMM", { locale: ptBR })
    const ok = await confirmDialog({
      title: `Remover "${session.routine_name}" de ${when}?`,
      message:
        'O treino e as séries dele saem do histórico, dos gráficos, da corrente e do XP. Não dá para desfazer.',
      confirmLabel: 'Remover treino',
      danger: true,
    })
    if (!ok) return
    await deleteSession(session.id)
    await reload()
  }

  return (
    <div>
      <Header title="Histórico de treinos" subtitle="Toque para ver o resumo" back="/academia" />

      {months.length === 0 ? (
        <EmptyState
          icon="📒"
          title="Nenhum treino ainda"
          description="Os treinos que você terminar aparecem aqui, do mais recente ao mais antigo."
        />
      ) : (
        months.map((month) => (
          <Section key={month.label} title={month.label}>
            <div className="flex flex-col gap-2">
              {month.items.map((session) => {
                const sets = setsBySession.get(session.id) ?? 0
                return (
                  <div
                    key={session.id}
                    className="flex items-center rounded-2xl border border-ink-700 bg-ink-850"
                  >
                    <Link
                      to={`/resumo/${session.id}`}
                      className="min-w-0 flex-1 rounded-l-2xl p-3.5 active:bg-ink-800"
                    >
                      <p className="truncate font-semibold">{session.routine_name}</p>
                      <p className="tnum text-xs text-ink-400">
                        {format(parseISO(session.started_at), "EEE, d/MM 'às' HH:mm", {
                          locale: ptBR,
                        })}
                        {' · '}
                        {sets} {sets === 1 ? 'série' : 'séries'}
                        {session.finished_at
                          ? ` · ${formatDuration(session.duration_seconds)} · ${formatVolume(session.total_volume)}`
                          : ' · não finalizado'}
                      </p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void remove(session)}
                      aria-label={`Remover ${session.routine_name}`}
                      className="shrink-0 rounded-r-2xl p-3.5 text-fire-400 active:bg-ink-800"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </Section>
        ))
      )}
    </div>
  )
}
