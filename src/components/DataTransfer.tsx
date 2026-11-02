import { useRef, useState } from 'react'
import { Button } from './ui'
import {
  ALL_CATEGORIES,
  CATEGORIES,
  categoriesIn,
  exportCategories,
  fileName,
  importCategories,
  type CategoryId,
  type PlanMode,
  type TransferFile,
} from '../lib/transfer'

/**
 * Backup por categoria: escolha o que exportar (ou tudo) e, ao importar, o que
 * do arquivo entra. O plano de treino tem dois modos — somar ao atual ou
 * trocar — e nunca encosta no historico.
 */
export default function DataTransfer({ onImported }: { onImported: () => Promise<void> }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [exportSel, setExportSel] = useState<CategoryId[]>([])
  const [pending, setPending] = useState<{ file: TransferFile; found: CategoryId[] } | null>(null)
  const [importSel, setImportSel] = useState<CategoryId[]>([])
  const [planMode, setPlanMode] = useState<PlanMode>('trocar')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const locked = useRef(false)

  const download = async (categories: CategoryId[]) => {
    if (categories.length === 0) return
    const data = await exportCategories(categories)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName(categories)
    link.click()
    URL.revokeObjectURL(url)
  }

  const open = async (file: File) => {
    setMessage(null)
    try {
      const parsed = JSON.parse(await file.text()) as TransferFile
      const found = categoriesIn(parsed)
      if (found.length === 0) {
        setMessage('O arquivo não tem dados que o app reconheça.')
        return
      }
      setPending({ file: parsed, found })
      // Plano sozinho e o caso comum (IA): ja vem marcado. Num backup completo,
      // tudo marcado, como antes.
      setImportSel(found)
    } catch {
      setMessage('Arquivo inválido. Use um JSON exportado por este app.')
    }
  }

  const apply = async () => {
    if (!pending || importSel.length === 0 || locked.current) return
    locked.current = true
    setBusy(true)
    try {
      const result = await importCategories(pending.file, importSel, planMode)
      await onImported()
      const parts = [`${result.applied} registros importados.`]
      if (result.matchedByName > 0)
        parts.push(
          `${result.matchedByName} exercício(s) reconhecido(s) pelo nome — o progresso continua neles.`,
        )
      if (result.archivedRoutines > 0)
        parts.push(
          `${result.archivedRoutines} treino(s) antigo(s) arquivado(s), histórico mantido.`,
        )
      setMessage(parts.join(' '))
      setPending(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível importar.')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  const toggle = (list: CategoryId[], id: CategoryId) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  return (
    <div>
      <p className="text-sm leading-relaxed text-ink-300">
        Exporte tudo ou só uma parte. Para trocar de treino com ajuda de uma IA, exporte só o{' '}
        <strong>Plano de treino</strong>, peça a mudança e importe o arquivo de volta: o histórico
        fica intacto.
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        {CATEGORIES.map((category) => (
          <CategoryRow
            key={category.id}
            label={category.label}
            hint={category.hint}
            checked={exportSel.includes(category.id)}
            onChange={() => setExportSel((sel) => toggle(sel, category.id))}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void download(ALL_CATEGORIES)}>
          Exportar tudo
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={exportSel.length === 0}
          onClick={() => void download(exportSel)}
        >
          Exportar só as marcadas
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
          Importar arquivo
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void open(file)
          event.target.value = ''
        }}
      />

      {pending && (
        <div className="mt-4 rounded-2xl border border-brand-600/50 bg-brand-600/10 p-3.5">
          <p className="text-sm font-bold">O que importar deste arquivo?</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {CATEGORIES.filter((c) => pending.found.includes(c.id)).map((category) => (
              <CategoryRow
                key={category.id}
                label={category.label}
                hint={category.hint}
                checked={importSel.includes(category.id)}
                onChange={() => setImportSel((sel) => toggle(sel, category.id))}
              />
            ))}
          </div>

          {importSel.includes('plano') && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink-200">Plano de treino</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <ModeButton
                  active={planMode === 'trocar'}
                  title="Trocar o plano"
                  hint="Treinos fora do arquivo são arquivados"
                  onClick={() => setPlanMode('trocar')}
                />
                <ModeButton
                  active={planMode === 'somar'}
                  title="Somar ao atual"
                  hint="Só entra ou muda o que veio"
                  onClick={() => setPlanMode('somar')}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                Sessões, séries e recordes nunca são apagados. Exercício com o mesmo nome de um que
                você já tem continua sendo o mesmo — com o progresso dele.
              </p>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPending(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void apply()}
              disabled={busy || importSel.length === 0}
            >
              Importar
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p className="mt-3 rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-3 text-xs text-ink-200">
          {message}
        </p>
      )}
    </div>
  )
}

function CategoryRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 shrink-0 accent-[#3987e5]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink-100">{label}</span>
        <span className="block text-[11px] text-ink-400">{hint}</span>
      </span>
    </label>
  )
}

function ModeButton({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left ${
        active ? 'border-brand-500 bg-brand-600/20' : 'border-ink-700 bg-ink-800/60'
      }`}
    >
      <span className="block text-xs font-bold text-ink-100">{title}</span>
      <span className="block text-[10px] leading-snug text-ink-400">{hint}</span>
    </button>
  )
}
