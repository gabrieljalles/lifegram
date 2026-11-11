import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'

/**
 * Vida: as areas que nao sao do dia a dia da agenda. Uma lista simples,
 * cada linha leva para a area como ela ja era.
 */
export default function Life() {
  const navigate = useNavigate()
  const { syncStatus, pendingCount } = useApp()

  const groups: Array<{ title: string; rows: Array<{ to: string; label: string; hint: string }> }> =
    [
      {
        title: 'Corpo',
        rows: [
          { to: '/academia', label: '🏋️ Treino', hint: 'Treinos da semana, iniciar e histórico' },
          { to: '/treinos', label: 'Rotinas', hint: 'Montar e editar os treinos' },
          { to: '/exercicios', label: 'Exercícios', hint: 'Catálogo e fotos' },
        ],
      },
      {
        title: 'Dinheiro',
        rows: [
          { to: '/financeiro', label: '💰 Financeiro', hint: 'Investimentos, vendas e impostos' },
        ],
      },
      {
        title: 'Cabeça',
        rows: [
          { to: '/vida/frases', label: '💬 Frases', hint: 'As que aparecem no Hoje e no widget' },
        ],
      },
      {
        title: 'App',
        rows: [
          {
            to: '/config',
            label: '⚙️ Ajustes',
            hint:
              syncStatus === 'local'
                ? 'Check-in, aparência, backup'
                : `Check-in, aparência, sincronização${pendingCount > 0 ? ` · ${pendingCount} na fila` : ''}`,
          },
        ],
      },
    ]

  return (
    <div className="pb-8">
      <header className="safe-t border-b-2 border-ink-100 px-5 pb-2.5 pt-4">
        <h1 className="font-display text-[40px] font-bold leading-none">Vida</h1>
      </header>
      {groups.map((group) => (
        <section key={group.title}>
          <h2 className="px-5 pb-1.5 pt-4 font-display text-sm font-bold uppercase tracking-widest text-margin">
            {group.title}
          </h2>
          <ul>
            {group.rows.map((row) => (
              <li key={row.to}>
                <button
                  type="button"
                  onClick={() => navigate(row.to)}
                  className="flex min-h-[56px] w-full items-center gap-3 border-b border-ink-700 px-5 py-2 text-left active:bg-ink-800"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium">{row.label}</span>
                    <span className="block text-xs text-ink-400">{row.hint}</span>
                  </span>
                  <span className="text-ink-400">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
