import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import PRCelebration from '../components/PRCelebration'
import RestTimer from '../components/RestTimer'
import { Button, ExercisePhoto } from '../components/ui'
import { usePhotoURL } from '../lib/photo'
import {
  bestSet,
  compareSets,
  formatDuration,
  formatVolume,
  formatWeight,
  suggestLoadIncrease,
  totalVolume,
} from '../lib/stats'
import { useApp } from '../lib/store'
import {
  DEFAULT_REP_CEILING,
  DEFAULT_WEIGHT_INCREMENT,
  type SetLog,
} from '../lib/types'
import { useElapsed, useWakeLock } from '../lib/timer'
import {
  abandonWorkout,
  adjustRest,
  completeSet,
  finishWorkout,
  jumpTo,
  rememberLoad,
  skipRest,
  undoSet,
} from '../lib/workout'

/** Ajuste fino no toque principal; o atalho grande cobre a troca de anilha. */
const WEIGHT_STEP = 1
const WEIGHT_BIG_STEP = 5

export default function ActiveWorkout() {
  const navigate = useNavigate()
  const { active, exerciseById, logsByExercise, setActive, reload } = useApp()

  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [celebration, setCelebration] = useState<{ label: string; detail: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const item = active?.items[active.cursor] ?? null
  const exercise = item ? exerciseById.get(item.exercise_id) : undefined
  const photo = usePhotoURL(exercise)

  // A tela nao pode apagar no meio da serie.
  useWakeLock(Boolean(active))
  const elapsed = useElapsed(active?.started_at)

  // Cada serie comeca do alvo planejado; ajustes valem so para a serie atual.
  useEffect(() => {
    if (!item) return
    setWeight(item.target_weight)
    setReps(item.target_reps)
  }, [item?.exercise_id, active?.set_number, active?.cursor])

  /**
   * A sessao anterior deste exercicio, inteira: serie a serie, carga de topo e
   * volume. E a referencia para saber, no meio do treino, se hoje esta melhor
   * ou pior que a ultima vez.
   */
  const lastSession = useMemo(() => {
    if (!item || !active) return null
    const previous = (logsByExercise.get(item.exercise_id) ?? []).filter(
      (log) => log.session_id !== active.session_id,
    )
    if (previous.length === 0) return null

    const lastId = previous[previous.length - 1].session_id
    const sets = previous.filter((log) => log.session_id === lastId)
    return {
      date: parseISO(sets[0].completed_at),
      sets,
      topWeight: Math.max(...sets.map((log) => log.weight)),
      volume: totalVolume(sets),
      /** Referencia da comparacao: a melhor serie daquele dia, por 1RM. */
      best: bestSet(sets) as SetLog,
    }
  }, [item?.exercise_id, logsByExercise, active?.session_id])

  /** O que ja foi feito hoje neste exercicio, para comparar ao vivo. */
  const todaySets = useMemo(() => {
    if (!item || !active) return []
    return (logsByExercise.get(item.exercise_id) ?? []).filter(
      (log) => log.session_id === active.session_id,
    )
  }, [item?.exercise_id, logsByExercise, active?.session_id])

  /**
   * Dupla progressao: se na ultima vez voce bateu o teto de repeticoes em
   * todas as series, a carga ja "venceu" — a sugestao aparece aqui, uma vez,
   * e some sozinha assim que voce sobe o peso.
   */
  const suggestion = useMemo(() => {
    if (!exercise || !lastSession) return null
    // Cardio nao progride por carga; o teto de reps nao se aplica.
    if (exercise.muscle_group === 'cardio') return null
    return suggestLoadIncrease(
      lastSession.sets,
      exercise.rep_ceiling ?? DEFAULT_REP_CEILING,
      exercise.weight_increment ?? DEFAULT_WEIGHT_INCREMENT,
    )
  }, [exercise?.id, exercise?.rep_ceiling, exercise?.weight_increment, lastSession])

  if (!active) return <Navigate to="/" replace />
  if (!item || !exercise) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-ink-300">Este exercício não está mais disponível.</p>
        <Button
          variant="outline"
          onClick={async () => {
            await abandonWorkout(active)
            await setActive(null)
            await reload()
            navigate('/')
          }}
        >
          Encerrar treino
        </Button>
      </div>
    )
  }

  const totalSets = item.target_sets
  const resting = active.rest_ends_at !== null && active.rest_ends_at > Date.now()

  const done = async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await completeSet(active, { weight, reps })
      // A carga que voce realmente usou vira o alvo da proxima vez.
      await rememberLoad(active.routine_id, item.exercise_id, weight, reps)

      if (result.isPR) {
        setCelebration({
          label: result.log.is_pr_weight ? 'Novo recorde de carga!' : 'Novo recorde de volume!',
          detail: `${exercise.name} · ${formatWeight(weight)} kg × ${reps}`,
        })
      }

      if (result.finished) {
        await finishWorkout(active)
        // Navega ANTES de recarregar: o reload zera o treino ativo e esta tela
        // redirecionaria para a home antes de o resumo entrar em cena.
        navigate(`/resumo/${active.session_id}`, { replace: true })
        await reload()
        return
      }

      await setActive(result.workout)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const act = async (fn: () => Promise<unknown>) => {
    setMenuOpen(false)
    await fn()
    await reload()
  }

  const nextIsNewExercise = active.set_number === 1
  const nextItem = active.items[active.cursor]
  const nextExercise = exerciseById.get(nextItem.exercise_id)

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-900">
      {/* ------------------------------------------------------ cabecalho */}
      <header className="safe-t flex items-center gap-3 px-4 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-ink-400">{active.routine_name}</p>
          <p className="tnum text-xs font-semibold text-ink-300">
            Exercício {active.cursor + 1} de {active.items.length}
          </p>
        </div>
        {/* Relogio do treino: quanto tempo voce ja esta na academia. */}
        <p
          className="tnum shrink-0 rounded-lg bg-ink-850 px-2 py-1 text-xs font-semibold text-ink-300"
          aria-label="Tempo de treino"
        >
          {formatDuration(elapsed)}
        </p>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Opções do treino"
          className="rounded-full p-2 text-ink-300 active:bg-ink-800"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
      </header>

      {/* Barra de progresso do treino inteiro. */}
      <div className="mx-4 h-1 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
          style={{
            width: `${((active.cursor + (active.set_number - 1) / totalSets) / active.items.length) * 100}%`,
          }}
        />
      </div>

      {menuOpen && (
        <div className="absolute right-4 top-16 z-40 w-60 overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 shadow-2xl">
          <MenuItem
            label="Desfazer última série"
            onClick={() =>
              act(async () => {
                const updated = await undoSet(active)
                if (updated) await setActive(updated)
              })
            }
          />
          <MenuItem
            label="Pular para o próximo exercício"
            disabled={active.cursor >= active.items.length - 1}
            onClick={() =>
              act(async () => {
                const updated = await jumpTo(active, active.cursor + 1)
                await setActive(updated)
              })
            }
          />
          <MenuItem
            label="Encerrar treino agora"
            danger
            onClick={() =>
              act(async () => {
                const session = await abandonWorkout(active)
                navigate(session ? `/resumo/${session.id}` : '/', { replace: true })
                await setActive(null)
              })
            }
          />
        </div>
      )}

      {/* --------------------------------------------------------- centro */}
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-5 pb-4 pt-3">
        <ExercisePhoto
          url={photo}
          group={exercise.muscle_group}
          className="aspect-4/3 w-full max-w-sm text-3xl"
        />

        <h1 className="mt-4 text-center text-2xl font-bold leading-tight tracking-tight">
          {exercise.name}
        </h1>

        {/* Bolinhas das series: quantas ja foram e quantas faltam. */}
        <div className="mt-2.5 flex items-center gap-1.5" aria-label={`Série ${active.set_number} de ${totalSets}`}>
          {Array.from({ length: totalSets }, (_, index) => (
            <span
              key={index}
              className={`h-2 rounded-full transition-all ${
                index < active.set_number - 1
                  ? 'w-6 bg-go-500'
                  : index === active.set_number - 1
                    ? 'w-6 bg-brand-400'
                    : 'w-2 bg-ink-700'
              }`}
            />
          ))}
          <span className="tnum ml-2 text-sm font-semibold text-ink-300">
            Série {active.set_number}/{totalSets}
          </span>
        </div>

        {/* ------------------------------------------- carga e repeticoes */}
        <div className="mt-6 grid w-full max-w-sm grid-cols-2 gap-3">
          <Stepper
            label="Carga"
            unit="kg"
            value={formatWeight(weight)}
            onDecrease={() => setWeight((w) => Math.max(0, Math.round((w - WEIGHT_STEP) * 10) / 10))}
            onIncrease={() => setWeight((w) => Math.round((w + WEIGHT_STEP) * 10) / 10)}
            onSet={(raw) => setWeight(Math.max(0, raw))}
            raw={weight}
            step={WEIGHT_STEP}
            bigStep={WEIGHT_BIG_STEP}
            onBigStep={(delta) =>
              setWeight((w) => Math.max(0, Math.round((w + delta) * 10) / 10))
            }
          />
          <Stepper
            label="Repetições"
            unit="reps"
            value={String(reps)}
            onDecrease={() => setReps((r) => Math.max(1, r - 1))}
            onIncrease={() => setReps((r) => r + 1)}
            onSet={(raw) => setReps(Math.max(1, Math.round(raw)))}
            raw={reps}
            step={1}
          />
        </div>

        {/* A sugestao some sozinha quando a carga chega no valor sugerido. */}
        {suggestion && weight < suggestion.weight && (
          <div className="animate-rise mt-4 w-full max-w-sm rounded-2xl border border-pr-500/50 bg-pr-500/10 px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-pr-400">
              <span aria-hidden="true">🔺</span> Hora de subir a carga
            </p>
            <p className="tnum mt-1 text-[11px] leading-relaxed text-ink-200">
              Na última vez você fez {suggestion.ceiling}+ repetições nas {suggestion.sets} séries
              com {formatWeight(suggestion.from)} kg. Subir o peso mantém o estímulo.
            </p>
            <button
              type="button"
              onClick={() => setWeight(suggestion.weight)}
              className="tnum mt-2 w-full rounded-xl bg-pr-500 py-2 text-sm font-bold text-ink-950 active:bg-pr-400"
            >
              Usar {formatWeight(suggestion.weight)} kg
            </button>
          </div>
        )}

        {lastSession ? (
          <LastSessionPanel
            date={lastSession.date}
            sets={lastSession.sets}
            best={lastSession.best}
            volume={lastSession.volume}
            todaySets={todaySets}
            currentWeight={weight}
            currentReps={reps}
          />
        ) : (
          <p className="mt-3 text-xs text-ink-400">
            Primeira vez neste exercício — a partir do próximo treino você vê aqui como foi hoje.
          </p>
        )}
      </div>

      {/* --------------------------------------------------------- acao */}
      <div className="safe-b shrink-0 border-t border-ink-800 bg-ink-900 px-5 pb-3 pt-3">
        <button
          type="button"
          onClick={done}
          disabled={busy}
          className="w-full rounded-2xl bg-go-600 py-5 text-lg font-extrabold tracking-wide text-white shadow-lg shadow-go-600/20 transition-transform active:scale-[0.98] active:bg-go-500 disabled:opacity-60"
        >
          ✓ PRONTO
        </button>
        <p className="mt-2 text-center text-[11px] text-ink-400">
          Descanso automático de {Math.floor(item.rest_seconds / 60)}min
          {item.rest_seconds % 60 > 0 ? ` ${item.rest_seconds % 60}s` : ''} após a série
        </p>
      </div>

      {resting && active.rest_ends_at && (
        <RestTimer
          endsAt={active.rest_ends_at}
          totalSeconds={active.rest_total_seconds}
          nextLabel={nextExercise?.name ?? 'Próximo exercício'}
          nextDetail={
            nextIsNewExercise
              ? `${nextItem.target_sets} séries × ${nextItem.target_reps} reps · ${formatWeight(nextItem.target_weight)} kg`
              : `Série ${active.set_number} de ${nextItem.target_sets} · ${formatWeight(nextItem.target_weight)} kg × ${nextItem.target_reps}`
          }
          onAdjust={(delta) =>
            void (async () => {
              const updated = await adjustRest(active, delta)
              await setActive(updated)
            })()
          }
          onSkip={() =>
            void (async () => {
              const updated = await skipRest(active)
              await setActive(updated)
            })()
          }
          onDone={() =>
            void (async () => {
              const updated = await skipRest(active)
              await setActive(updated)
            })()
          }
        />
      )}

      {celebration && (
        <PRCelebration
          label={celebration.label}
          detail={celebration.detail}
          onDone={() => setCelebration(null)}
        />
      )}
    </div>
  )
}

/* ----------------------------------------------- historico da ultima vez */

/**
 * Como foi este exercicio na sessao passada, serie a serie, com a comparacao
 * do que esta engatilhado agora. O objetivo e responder "estou melhorando ou
 * piorando?" sem sair da tela de treino.
 */
function LastSessionPanel({
  date,
  sets,
  best,
  volume,
  todaySets,
  currentWeight,
  currentReps,
}: {
  date: Date
  sets: SetLog[]
  best: SetLog
  volume: number
  todaySets: SetLog[]
  currentWeight: number
  currentReps: number
}) {
  // O veredito vem do 1RM estimado, entao trocar carga por repeticao conta.
  const comparison = compareSets({ weight: currentWeight, reps: currentReps }, best)
  const todayTop = todaySets.length ? Math.max(...todaySets.map((log) => log.weight)) : 0

  return (
    <div className="mt-4 w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-850 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          Última vez · {format(date, 'dd/MM')}
        </p>
        <p className="tnum text-[11px] text-ink-400">
          {sets.length} {sets.length === 1 ? 'série' : 'séries'}
        </p>
      </div>

      <div className="tnum mt-1.5 flex flex-wrap gap-1.5">
        {sets.map((log) => (
          <span
            key={log.id}
            className="rounded-lg bg-ink-800 px-2 py-0.5 text-xs font-semibold text-ink-200"
          >
            {formatWeight(log.weight)} kg × {log.reps}
          </span>
        ))}
      </div>

      <div className="tnum mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-400">
        <span>
          melhor {formatWeight(best.weight)} kg × {best.reps} · {formatVolume(volume)}
        </span>
        {/* Seta + texto: a direcao nunca depende so da cor. */}
        <span
          className={`shrink-0 text-right font-bold ${
            comparison.direction === 'up'
              ? 'text-go-400'
              : comparison.direction === 'down'
                ? 'text-fire-400'
                : 'text-ink-300'
          }`}
        >
          {comparison.direction !== 'same' && (
            <span aria-hidden="true">{comparison.direction === 'up' ? '▲ ' : '▼ '}</span>
          )}
          {comparison.label}
        </span>
      </div>

      {todaySets.length > 0 && (
        <div className="tnum mt-2 border-t border-ink-700 pt-2 text-[11px] text-ink-300">
          Hoje: {todaySets.length} {todaySets.length === 1 ? 'série' : 'séries'} · máx{' '}
          {formatWeight(todayTop)} kg · {formatVolume(totalVolume(todaySets))}
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------- auxiliares */

function MenuItem({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full px-4 py-3 text-left text-sm font-medium disabled:opacity-40 ${
        danger ? 'text-fire-400' : 'text-ink-100'
      } active:bg-ink-800`}
    >
      {label}
    </button>
  )
}

/**
 * Controle de valor com alvos grandes: no meio da serie ninguem acerta um
 * campo de texto pequeno, entao os botoes fazem o trabalho e o campo fica
 * disponivel para o ajuste fino.
 */
function Stepper({
  label,
  unit,
  value,
  raw,
  step,
  bigStep,
  onDecrease,
  onIncrease,
  onBigStep,
  onSet,
}: {
  label: string
  unit: string
  value: string
  raw: number
  step: number
  /** Atalho opcional para saltos maiores (trocar a anilha, nao ajustar fino). */
  bigStep?: number
  onDecrease: () => void
  onIncrease: () => void
  onBigStep?: (delta: number) => void
  onSet: (value: number) => void
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 p-3">
      <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-between gap-1">
        <StepButton onClick={onDecrease} label={`Diminuir ${label}`}>
          −
        </StepButton>
        {editing ? (
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            defaultValue={raw}
            step={step}
            onBlur={(event) => {
              const parsed = Number.parseFloat(event.target.value.replace(',', '.'))
              if (Number.isFinite(parsed)) onSet(parsed)
              setEditing(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            className="tnum w-full min-w-0 rounded-lg bg-ink-800 py-1 text-center text-2xl font-bold text-ink-50 outline-none ring-2 ring-brand-500"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-w-0 flex-1 px-0.5 text-center leading-none"
          >
            <span className="tnum block truncate text-3xl font-bold text-ink-50">{value}</span>
            <span className="mt-0.5 block text-[10px] font-semibold text-ink-400">{unit}</span>
          </button>
        )}
        <StepButton onClick={onIncrease} label={`Aumentar ${label}`}>
          +
        </StepButton>
      </div>

      {bigStep && onBigStep && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onBigStep(-bigStep)}
            aria-label={`Diminuir ${label} em ${bigStep}`}
            className="tnum rounded-lg bg-ink-800 px-2.5 py-1 text-[11px] font-bold text-ink-300 active:bg-ink-700"
          >
            −{bigStep}
          </button>
          <button
            type="button"
            onClick={() => onBigStep(bigStep)}
            aria-label={`Aumentar ${label} em ${bigStep}`}
            className="tnum rounded-lg bg-ink-800 px-2.5 py-1 text-[11px] font-bold text-ink-300 active:bg-ink-700"
          >
            +{bigStep}
          </button>
        </div>
      )}
    </div>
  )
}

function StepButton({
  children,
  onClick,
  label,
}: {
  children: string
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-10 w-10 shrink-0 rounded-xl bg-ink-800 text-xl font-bold text-ink-100 active:bg-ink-700"
    >
      {children}
    </button>
  )
}
