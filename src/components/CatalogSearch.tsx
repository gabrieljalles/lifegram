import { useEffect, useMemo, useState } from 'react'
import { MUSCLE_LABEL } from './ui'
import { loadCatalog, searchCatalog, type CatalogExercise } from '../lib/exerciseCatalog'
import { normalizeName } from '../lib/transfer'

/**
 * Busca no catalogo de exercicios prontos. Um toque preenche nome, grupo,
 * forma de medir e foto do formulario — dai e so ajustar o que quiser.
 */
export default function CatalogSearch({
  onPick,
  existingNames,
}: {
  onPick: (item: CatalogExercise) => void
  /** Nomes (normalizados) que voce ja cadastrou: ganham o selo "você já tem". */
  existingNames: Set<string>
}) {
  const [catalog, setCatalog] = useState<CatalogExercise[] | null>(null)
  const [query, setQuery] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    loadCatalog().then(
      (list) => alive && setCatalog(list),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [])

  const results = useMemo(
    () => (catalog ? searchCatalog(catalog, query, 30) : []),
    [catalog, query],
  )

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ex.: supino, rosca scott, leg press"
        aria-label="Buscar exercício no catálogo"
        enterKeyHint="search"
        autoComplete="off"
        className="w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500"
      />
      {failed && (
        <p className="mt-2 px-1 text-[11px] text-fire-400">Não foi possível abrir o catálogo.</p>
      )}
      {query.trim() && catalog && results.length === 0 && (
        <p className="mt-2 px-1 text-[11px] text-ink-400">
          Nada encontrado. Tente outra palavra (vale em inglês também) ou crie do zero abaixo.
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-2 flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto pr-0.5">
          {results.map((item) => {
            const owned = existingNames.has(normalizeName(item.name))
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-2 text-left active:bg-ink-800"
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-14 w-14 shrink-0 rounded-lg bg-ink-800 object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-[10px] text-ink-400">
                      sem foto
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug text-ink-100">
                      {item.name}
                    </span>
                    <span className="block truncate text-[11px] text-ink-400">
                      {MUSCLE_LABEL[item.group]}
                      {item.measure === 'tempo' ? ' · por tempo' : ''} · {item.english}
                    </span>
                  </span>
                  {owned && (
                    <span className="shrink-0 rounded-full bg-go-600/20 px-2 py-0.5 text-[10px] font-bold text-go-400">
                      você já tem
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 px-1 text-[10px] leading-relaxed text-ink-400">
        Catálogo livre free-exercise-db (domínio público), com nomes traduzidos.
      </p>
    </div>
  )
}
