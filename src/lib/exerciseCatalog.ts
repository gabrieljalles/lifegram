/**
 * Catalogo de exercicios prontos (nome + foto) para nao criar do zero.
 *
 * Fonte: free-exercise-db (github.com/yuhonas/free-exercise-db), dominio
 * publico (Unlicense). Os nomes foram traduzidos para o portugues usado nas
 * academias; o nome original em ingles continua pesquisavel. As fotos ficam
 * hospedadas no GitHub e so sao baixadas quando voce escolhe um exercicio —
 * ai viram foto local, comprimida, como as que voce tira.
 *
 * O JSON (~85 KB) e carregado sob demanda, so quando a busca abre.
 */

import { normalizeName } from './transfer'
import type { ExerciseMeasure, MuscleGroup } from './types'

export interface CatalogExercise {
  id: string
  name: string
  english: string
  group: MuscleGroup
  measure: ExerciseMeasure
  /** URL da primeira foto; null nos poucos sem imagem. */
  image: string | null
}

/** [id, nome pt, nome en, grupo, 1 = tempo, 1 = tem foto] */
type Row = [string, string, string, MuscleGroup, 0 | 1, 0 | 1]

export const CATALOG_IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

export function fromRow([id, name, english, group, tempo, image]: Row): CatalogExercise {
  return {
    id,
    name,
    english,
    group,
    measure: tempo ? 'tempo' : 'reps',
    image: image ? `${CATALOG_IMAGE_BASE}${id}/0.jpg` : null,
  }
}

let cache: Promise<CatalogExercise[]> | null = null

export function loadCatalog(): Promise<CatalogExercise[]> {
  cache ??= import('../data/exerciseCatalog.json').then((mod) =>
    (mod.default as unknown as Row[]).map(fromRow),
  )
  return cache
}

/**
 * Busca por palavras, em qualquer ordem, no nome em portugues e em ingles,
 * sem acento nem caixa ("rosca scott", "scott rosca", "preacher" acham o
 * mesmo). Ordem: comeca com a busca > alguma palavra comeca com ela > resto;
 * no empate, o nome mais curto (o exercicio "basico" antes das variacoes).
 */
export function searchCatalog(
  catalog: CatalogExercise[],
  query: string,
  limit = 30,
): CatalogExercise[] {
  const q = normalizeName(query)
  if (!q) return []
  const words = q.split(' ')
  const scored: Array<{ item: CatalogExercise; score: number }> = []
  for (const item of catalog) {
    const pt = normalizeName(item.name)
    const hay = `${pt} ${normalizeName(item.english)}`
    if (!words.every((w) => hay.includes(w))) continue
    const score = pt.startsWith(q)
      ? 0
      : ` ${pt}`.includes(` ${q}`)
        ? 1
        : words.every((w) => ` ${pt}`.includes(` ${w}`))
          ? 2
          : 3
    scored.push({ item, score })
  }
  scored.sort((a, b) => a.score - b.score || a.item.name.length - b.item.name.length)
  return scored.slice(0, limit).map((s) => s.item)
}

/** Baixa a foto do catalogo como arquivo, para entrar no fluxo de foto local. */
export async function fetchCatalogPhoto(item: CatalogExercise): Promise<File | null> {
  if (!item.image) return null
  const response = await fetch(item.image)
  if (!response.ok) throw new Error(`Foto indisponível (${response.status})`)
  const blob = await response.blob()
  return new File([blob], `${item.id}.jpg`, { type: blob.type || 'image/jpeg' })
}
