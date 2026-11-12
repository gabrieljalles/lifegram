import { useMemo } from 'react'
import { activityXP } from './activities'
import { PERFECT_DAY_XP, dailyMissions, perfectDays, weeklyBoss } from './missions'
import { useApp } from './store'
import { computeXP } from './xp'

/**
 * Estado do jogo inteiro, derivado dos dados do app. Um hook so para a tela
 * Hoje e as outras mostrarem sempre o mesmo nivel e as mesmas missoes.
 */
export function useGame() {
  const {
    routines,
    sessions,
    setLogs,
    settings,
    courageRejections,
    courageTrackSteps,
    courageAttempts,
    activities,
    activityLogs,
  } = useApp()

  return useMemo(() => {
    const input = {
      routines,
      sessions,
      settings,
      rejections: courageRejections,
      trackSteps: courageTrackSteps,
    }
    const perfect = perfectDays(input)
    const xp = computeXP({
      sessions,
      setLogs,
      rejections: courageRejections,
      trackSteps: courageTrackSteps,
      attempts: courageAttempts,
      bonus: perfect.total * PERFECT_DAY_XP,
      agenda: activityXP(activities, activityLogs),
    })
    const missions = dailyMissions(input)
    return { xp, perfect, missions, boss: weeklyBoss(input) }
  }, [
    routines,
    sessions,
    setLogs,
    settings,
    courageRejections,
    courageTrackSteps,
    courageAttempts,
    activities,
    activityLogs,
  ])
}
