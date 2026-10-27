import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import PRCelebration from '../components/PRCelebration'
import { LevelCard, MissionCard, StatPill } from '../components/game'
import { NextActivityCard } from '../components/agenda-ui'
import { useNow } from '../lib/useNow'
import { agendaOf, nextOccurrence, streakOf } from '../lib/activities'
import { toggleActivity } from '../lib/activityActions'
import { PERFECT_DAY_XP, type Mission, type WeeklyBoss } from '../lib/missions'
import { onlyNaos } from '../lib/rejections'
import { computeScheduleStreak, scheduleOf } from '../lib/stats'
import { useApp } from '../lib/store'
import { vibrate } from '../lib/timer'
import { useGame } from '../lib/useGame'
import { startWorkout } from '../lib/workout'

// three.js pesa: o chefao 3D so baixa quando a tela Hoje aparece.
const Boss3D = lazy(() => import('../components/Boss3D'))

/** Nivel ja comemorado: guardado por aparelho, so para nao repetir a festa. */
const LEVEL_KEY = 'game:lastLevel'

const readLevel = (): number | null => {
  try {
    const raw = localStorage.getItem(LEVEL_KEY)
    return raw ? Number(raw) : null
  } catch {
    return null
  }
}
const writeLevel = (level: number) => {
  try {
    localStorage.setItem(LEVEL_KEY, String(level))
  } catch {
    // Sem storage (aba anonima): so perde a comemoracao.
  }
}

const greeting = (hour: number) =>
  hour < 5 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

/**
 * Hoje: a porta de entrada. Responde de relance "o que eu faco agora?" — as
 * missoes do dia, o nivel subindo e o chefao da semana perdendo vida.
 */
export default function Today() {
  const navigate = useNavigate()
  const {
    sessions,
    routines,
    settings,
    setLogs,
    courageRejections,
    activities,
    activityLogs,
    active,
    setActive,
    reload,
  } = useApp()
  const clock = useNow()
  const { xp, perfect, missions, boss } = useGame()
  const [busy, setBusy] = useState(false)
  const [levelUp, setLevelUp] = useState<number | null>(null)

  const streak = useMemo(
    () => computeScheduleStreak(sessions, scheduleOf(routines, settings)),
    [sessions, routines, settings],
  )
  const prs = useMemo(
    () => setLogs.filter((log) => log.is_pr_weight || log.is_pr_volume).length,
    [setLogs],
  )
  const naosTotal = useMemo(() => onlyNaos(courageRejections).length, [courageRejections])

  const next = useMemo(
    () => nextOccurrence(activities, activityLogs, clock),
    [activities, activityLogs, clock],
  )
  const todayLeft = useMemo(
    () => agendaOf(activities, activityLogs, clock, clock).filter((o) => !o.done).length,
    [activities, activityLogs, clock],
  )
  const hasActivities = activities.some((a) => !a.archived)

  const completeNext = async () => {
    if (!next) return
    await toggleActivity(next.activity.id, next.day)
    vibrate(40)
    await reload()
  }

  // Subiu de nivel desde a ultima visita: festa. Primeira visita so registra.
  useEffect(() => {
    const seen = readLevel()
    if (seen !== null && xp.level > seen) {
      setLevelUp(xp.level)
      vibrate([120, 60, 120, 60, 260])
    }
    writeLevel(xp.level)
  }, [xp.level])

  const required = missions.filter((m) => !m.optional)
  const doneCount = required.filter((m) => m.done).length
  const allDone = required.length > 0 && doneCount === required.length

  const begin = async (mission: Mission) => {
    if (active) return navigate('/treino')
    if (!mission.routine) return navigate('/academia')
    if (busy) return
    setBusy(true)
    try {
      const workout = await startWorkout(mission.routine)
      await setActive(workout)
      await reload()
      navigate('/treino')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível iniciar o treino.')
    } finally {
      setBusy(false)
    }
  }

  const now = new Date()

  return (
    <div className="pb-6">
      <header className="safe-t flex items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <p className="text-xs font-medium capitalize text-ink-400">
            {format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
          <h1 className="mt-0.5 text-2xl font-black tracking-tight">
            {greeting(now.getHours())} <span aria-hidden="true">⚔️</span>
          </h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/config')}
          aria-label="Ajustes"
          className="rounded-full border border-ink-700 bg-ink-850 p-2.5 text-ink-300 active:bg-ink-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </header>

      {/* O chefao abre a tela: e a primeira coisa que voce ve ao entrar. */}
      <div className="px-4 pb-3">
        <BossCard boss={boss} />
      </div>

      <div className="px-4">
        <LevelCard xp={xp} />

        <div className="mt-3 flex gap-2">
          <StatPill icon="🔥" value={streak.current} label="corrente" tone="fire" />
          <StatPill icon="💎" value={perfect.streak} label="dias perfeitos" tone="gold" />
          <StatPill icon="🦁" value={naosTotal} label="nãos" />
          <StatPill icon="🏆" value={prs} label="recordes" tone="go" />
        </div>
      </div>

      {active && (
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => navigate('/treino')}
            className="animate-glow flex w-full items-center gap-3 rounded-2xl border-2 border-brand-400 bg-brand-600/20 p-3.5 text-left"
          >
            <span className="text-2xl" aria-hidden="true">
              ⚡
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-black uppercase tracking-widest text-brand-400">
                Em andamento
              </span>
              <span className="block truncate font-bold">{active.routine_name}</span>
            </span>
            <span className="text-sm font-bold text-brand-400">Voltar ›</span>
          </button>
        </div>
      )}

      {/* Agenda: a proxima coisa marcada, com o check a um toque. */}
      <div className="px-4 pt-4">
        {next ? (
          <NextActivityCard
            occ={next}
            streak={streakOf(next.activity, activityLogs, clock)}
            now={clock}
            todayLeft={todayLeft}
            onDone={() => void completeNext()}
            onOpen={() => navigate('/agenda')}
          />
        ) : (
          !hasActivities && (
            <button
              type="button"
              onClick={() => navigate('/agenda/nova')}
              className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-ink-600 bg-ink-850/60 p-3.5 text-left active:bg-ink-800"
            >
              <span className="text-3xl" aria-hidden="true">
                🗓️
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-black">Programe sua rotina</span>
                <span className="block text-xs text-ink-400">
                  Hábitos e compromissos viram missões com XP.
                </span>
              </span>
              <span className="text-sm font-bold text-brand-400">Criar ›</span>
            </button>
          )
        )}
      </div>

      <section className="px-4 pt-5">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-ink-300">
            Missões de hoje
          </h2>
          <span className="tnum text-xs font-bold text-ink-400">
            {doneCount}/{required.length}
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          {missions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onClick={() => navigate(mission.to)}
              action={missionAction(mission)}
            />
          ))}
        </div>

        <Chest open={allDone} streak={perfect.streak} />
      </section>

      {levelUp !== null && (
        <PRCelebration
          icon="🛡️"
          label={`Nível ${levelUp}!`}
          detail={`${xp.title} · faltam ${xp.span - xp.into} XP para o próximo`}
          onDone={() => setLevelUp(null)}
        />
      )}
    </div>
  )

  function missionAction(mission: Mission) {
    if (mission.id === 'treino' && !mission.done) {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => void begin(mission)}
          className="w-full rounded-xl bg-go-600 py-3 text-sm font-black uppercase tracking-wide text-white shadow-[0_0_18px_rgba(34,197,94,0.35)] active:bg-go-500 disabled:opacity-50"
        >
          {active ? 'Continuar treino' : mission.routine ? 'Começar treino ›' : 'Montar um treino ›'}
        </button>
      )
    }
    return null
  }
}

function Chest({ open, streak }: { open: boolean; streak: number }) {
  return (
    <div
      className={`mt-3 flex items-center gap-3 rounded-2xl border-2 p-3.5 ${
        open
          ? 'animate-pop-in border-pr-400 bg-pr-500/15 shadow-[0_0_24px_rgba(245,158,11,0.35)]'
          : 'border-dashed border-ink-600 bg-ink-850/60'
      }`}
    >
      <span className={`text-4xl ${open ? 'animate-wobble' : 'opacity-50 grayscale'}`} aria-hidden="true">
        {open ? '🎁' : '🔒'}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-black ${open ? 'text-pr-400' : 'text-ink-300'}`}>
          {open ? 'Dia perfeito!' : 'Baú do dia'}
        </p>
        <p className="text-xs text-ink-400">
          {open
            ? `+${PERFECT_DAY_XP} XP de bônus${streak > 1 ? ` · ${streak} dias perfeitos seguidos` : ''}`
            : `Cumpra as missões para abrir · +${PERFECT_DAY_XP} XP`}
        </p>
      </div>
    </div>
  )
}

function BossCard({ boss }: { boss: WeeklyBoss }) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border-2 ${
        boss.defeated ? 'border-go-500/60 bg-go-500/10' : 'border-red-500/40'
      }`}
      style={
        boss.defeated
          ? undefined
          : {
              background:
                'radial-gradient(80% 70% at 50% 35%, rgba(239,68,68,0.22), transparent 70%), #12090d',
            }
      }
    >
      <Suspense
        fallback={
          <div className="flex h-[230px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-700 border-t-red-400" />
          </div>
        }
      >
        <Boss3D design={boss.design} life={boss.life} defeated={boss.defeated} />
      </Suspense>

      <div className="px-4 pb-4">
        <p className="text-center text-[10px] font-black uppercase tracking-widest text-ink-400">
          {boss.defeated ? 'Derrotado!' : 'Chefão da semana · até domingo'}
        </p>
        <p className="truncate text-center text-xl font-black">{boss.name}</p>
        <div
          className="mt-2 h-3.5 overflow-hidden rounded-full bg-ink-950/70 ring-1 ring-red-900"
          role="progressbar"
          aria-label="Vida do chefão"
          aria-valuemin={0}
          aria-valuemax={boss.hp}
          aria-valuenow={boss.hp - boss.damage}
        >
          <div
            className="hp-fill h-full rounded-full transition-[width] duration-700"
            style={{ width: `${boss.life * 100}%` }}
          />
        </div>
        <p className="tnum mt-1 text-center text-[11px] text-ink-300">
          {boss.defeated
            ? 'Semana vencida. Na segunda chega outro.'
            : `${boss.hp - boss.damage} / ${boss.hp} de vida · toque nele`}
        </p>
        <p className="tnum mt-3 flex justify-around border-t border-ink-700/60 pt-2.5 text-[11px] text-ink-300">
          <span>🏋️ {boss.hits.treinos} treinos</span>
          <span>🦁 {boss.hits.naos} nãos</span>
          <span>✨ {boss.hits.outros} além do não</span>
        </p>
      </div>
    </div>
  )
}
