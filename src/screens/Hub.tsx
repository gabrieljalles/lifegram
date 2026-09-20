import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button, Card, Section } from '../components/ui'
import { computeScheduleStreak, scheduleOf } from '../lib/stats'
import { useApp } from '../lib/store'
import { ACCENT_RING, ACCENT_TEXT, SKILL_AREAS } from '../lib/skills'

/**
 * Porta de entrada do app. Cada retangulo e uma area da vida; a de exercicios
 * leva para a tela de treino que ja existia. O hub nao mede nada por conta
 * propria — quem faz isso e a tela de Desempenho.
 */
export default function Hub() {
  const navigate = useNavigate()
  const { routines, sessions, settings, active } = useApp()

  const streak = useMemo(
    () => computeScheduleStreak(sessions, scheduleOf(routines, settings)),
    [sessions, routines, settings],
  )

  const hoje = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <div>
      <header className="safe-t px-4 pb-2 pt-4">
        <p className="text-xs capitalize text-ink-400">{hoje}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Suas áreas</h1>
          {streak.current > 0 && (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-fire-500/15 px-2.5 py-1 text-fire-400">
              <span aria-hidden="true">🔥</span>
              <span className="tnum text-sm font-bold">{streak.current}</span>
            </div>
          )}
        </div>
      </header>

      {active && (
        <div className="px-4 pb-1 pt-2">
          <Card className="animate-rise border-brand-500/40 bg-brand-600/10 p-4">
            <p className="text-xs font-medium text-brand-400">Treino em andamento</p>
            <p className="mt-0.5 font-semibold">{active.routine_name}</p>
            <p className="mt-0.5 text-xs text-ink-400">
              iniciado {format(parseISO(active.started_at), 'HH:mm')}
            </p>
            <Button
              className="mt-3 w-full"
              size="lg"
              variant="go"
              onClick={() => navigate('/treino')}
            >
              Continuar treino
            </Button>
          </Card>
        </div>
      )}

      <Section title="Áreas">
        <div className="flex flex-col gap-2.5">
          {SKILL_AREAS.map((area) => {
            const disponivel = area.to !== null
            return (
              <Card
                key={area.id}
                className={`p-4 ${disponivel ? ACCENT_RING[area.accent] : 'opacity-70'}`}
                onClick={disponivel ? () => navigate(area.to as string) : undefined}
              >
                <div className="flex items-center gap-3.5">
                  <span className="text-3xl" aria-hidden="true">
                    {area.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold">{area.name}</p>
                      {!disponivel && (
                        <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                          em breve
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{area.blurb}</p>
                  </div>
                  {disponivel && (
                    <span className={ACCENT_TEXT[area.accent]} aria-hidden="true">
                      ›
                    </span>
                  )}
                </div>
              </Card>
            )
          })}

          {/* Desempenho fica no mesmo nivel das areas: e a visao que cruza todas. */}
          <Card
            className="border-pr-500/40 bg-pr-500/10 p-4"
            onClick={() => navigate('/desempenho')}
          >
            <div className="flex items-center gap-3.5">
              <span className="text-3xl" aria-hidden="true">
                📈
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">Desempenho</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-400">
                  Gráficos e números de todas as skills num lugar só
                </p>
              </div>
              <span className="text-pr-400" aria-hidden="true">
                ›
              </span>
            </div>
          </Card>
        </div>
      </Section>
    </div>
  )
}
