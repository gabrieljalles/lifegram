import { Suspense, lazy } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './lib/store'
import Today from './screens/Today'
import Home from './screens/Home'
import ActiveWorkout from './screens/ActiveWorkout'
import WorkoutSummary from './screens/WorkoutSummary'
import RoutineList from './screens/editor/RoutineList'
import RoutineEditor from './screens/editor/RoutineEditor'
import ExerciseList from './screens/editor/ExerciseList'
import ExerciseEditor from './screens/editor/ExerciseEditor'
import Settings from './screens/Settings'

// Os graficos pesam mais que o resto do app somado: so carregam quando
// o usuario abre o progresso, nunca durante o treino.
const Stats = lazy(() => import('./screens/Stats'))
const Performance = lazy(() => import('./screens/Performance'))
const CourageHome = lazy(() => import('./screens/courage/CourageHome'))
const CourageGoalDetail = lazy(() => import('./screens/courage/CourageGoalDetail'))
const CourageGoalForm = lazy(() => import('./screens/courage/CourageGoalForm'))
const CourageAttemptForm = lazy(() => import('./screens/courage/CourageAttemptForm'))
const CourageDashboard = lazy(() => import('./screens/courage/CourageDashboard'))
const CourageTrack = lazy(() => import('./screens/courage/CourageTrack'))
const CourageCalibrate = lazy(() => import('./screens/courage/CourageCalibrate'))
const ExerciseDetail = lazy(() => import('./screens/ExerciseDetail'))

/** A tela de treino e imersiva: sem barra de navegacao competindo com o foco. */
const IMMERSIVE = ['/treino', '/resumo', '/coragem/mapa']

interface NavItem {
  to: string
  label: string
  icon: string
  /** Prefixos que acendem este item. */
  match: (pathname: string) => boolean
}

/**
 * Barra fixa: os mesmos quatro destinos em qualquer tela. Antes ela mudava
 * por area e a pessoa nunca sabia onde estava.
 */
const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Hoje',
    icon: 'M12 2l2.4 6.9H22l-6 4.6 2.3 7.1L12 16.2l-6.3 4.4L8 13.5 2 8.9h7.6z',
    match: (p) => p === '/',
  },
  {
    to: '/academia',
    label: 'Treino',
    icon: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10',
    match: (p) => ['/academia', '/treinos', '/exercicio'].some((x) => p.startsWith(x)),
  },
  {
    to: '/coragem',
    label: 'Coragem',
    icon: 'M12 3c3 3 5 6 5 9a5 5 0 01-10 0c0-1.5.5-3 1.5-4 .5 2 1.5 3 2.5 3 0-3 0-5 1-8z',
    match: (p) => p.startsWith('/coragem') && !p.startsWith('/coragem/painel'),
  },
  {
    to: '/desempenho',
    label: 'Progresso',
    icon: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
    match: (p) => ['/desempenho', '/stats', '/coragem/painel'].some((x) => p.startsWith(x)),
  },
]

function BottomNav() {
  const { pathname } = useLocation()
  if (IMMERSIVE.some((prefix) => pathname.startsWith(prefix))) return null

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 backdrop-blur safe-b">
      <div className="mx-auto flex max-w-lg">
        {NAV.map((item) => {
          const on = item.match(pathname)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={on ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors ${
                on ? 'text-brand-400' : 'text-ink-400'
              }`}
            >
              {on && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-400 shadow-[0_0_10px_rgba(129,140,248,0.9)]"
                />
              )}
              <svg
                viewBox="0 0 24 24"
                fill={on ? 'currentColor' : 'none'}
                fillOpacity={on ? 0.2 : 0}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d={item.icon} />
              </svg>
              {item.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

export default function App() {
  const { ready } = useApp()
  const { pathname } = useLocation()
  const immersive = IMMERSIVE.some((prefix) => pathname.startsWith(prefix))

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-ink-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
      </div>
    )
  }

  return (
    <div className="min-h-full">
      <main className={`mx-auto max-w-lg ${immersive ? '' : 'pb-24'}`}>
        <Suspense
          fallback={
            <div className="flex h-dvh items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/academia" element={<Home />} />
            <Route path="/desempenho" element={<Performance />} />
            <Route path="/coragem" element={<CourageHome />} />
            <Route path="/coragem/painel" element={<CourageDashboard />} />
            <Route path="/coragem/mapa" element={<CourageTrack />} />
            <Route path="/coragem/mapa/calibrar" element={<CourageCalibrate />} />
            <Route path="/coragem/novo" element={<CourageGoalForm />} />
            <Route path="/coragem/tentativa/:attemptId" element={<CourageAttemptForm />} />
            <Route path="/coragem/:goalId" element={<CourageGoalDetail />} />
            <Route path="/coragem/:goalId/editar" element={<CourageGoalForm />} />
            <Route path="/coragem/:goalId/tentativa" element={<CourageAttemptForm />} />
            <Route path="/treino" element={<ActiveWorkout />} />
            <Route path="/resumo/:sessionId" element={<WorkoutSummary />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/exercicio/:exerciseId" element={<ExerciseDetail />} />
            <Route path="/treinos" element={<RoutineList />} />
            <Route path="/treinos/:routineId" element={<RoutineEditor />} />
            <Route path="/exercicios" element={<ExerciseList />} />
            <Route path="/exercicios/:exerciseId" element={<ExerciseEditor />} />
            <Route path="/config" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  )
}
