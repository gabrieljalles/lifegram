import { Suspense, lazy } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './lib/store'
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
const ExerciseDetail = lazy(() => import('./screens/ExerciseDetail'))

/** A tela de treino e imersiva: sem barra de navegacao competindo com o foco. */
const IMMERSIVE = ['/treino', '/resumo']

function BottomNav() {
  const { pathname } = useLocation()
  if (IMMERSIVE.some((prefix) => pathname.startsWith(prefix))) return null

  const items = [
    { to: '/', label: 'Treinar', icon: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10', exact: true },
    {
      to: '/stats',
      label: 'Progresso',
      icon: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
    },
    { to: '/treinos', label: 'Montar', icon: 'M4 6h16M4 12h16M4 18h10' },
    {
      to: '/config',
      label: 'Ajustes',
      icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM3 12h3m12 0h3M12 3v3m0 12v3',
    },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 backdrop-blur safe-b">
      <div className="mx-auto flex max-w-lg">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-brand-400' : 'text-ink-400'
              }`
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d={item.icon} />
            </svg>
            {item.label}
          </NavLink>
        ))}
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
            <Route path="/" element={<Home />} />
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
