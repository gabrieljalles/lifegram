import { describe, expect, it } from 'vitest'
import raw from '../data/exerciseCatalog.json'
import { fromRow, searchCatalog, type CatalogExercise } from './exerciseCatalog'
import { MUSCLE_GROUPS } from './types'

const catalog: CatalogExercise[] = (raw as never as Parameters<typeof fromRow>[0][]).map(fromRow)
const names = (query: string, limit = 5) => searchCatalog(catalog, query, limit).map((e) => e.name)

describe('catalogo', () => {
  it('tem todos os exercicios com grupo valido e nomes unicos', () => {
    expect(catalog.length).toBe(876)
    expect(catalog.every((e) => MUSCLE_GROUPS.includes(e.group))).toBe(true)
    expect(new Set(catalog.map((e) => e.name)).size).toBe(catalog.length)
  })

  it('acha em portugues, sem acento e em qualquer ordem', () => {
    expect(names('supino reto', 3)).toContain('Supino reto com barra')
    expect(names('scott rosca')).toContain('Rosca Scott com barra')
    expect(names('triceps corda')).toContain('Tríceps corda')
    expect(names('extensora')[0]).toBe('Cadeira extensora')
  })

  it('acha pelo nome em ingles tambem', () => {
    expect(names('preacher curl', 10)).toContain('Rosca Scott com barra')
    expect(names('leg press')[0]).toBe('Leg press 45°')
  })

  it('o que comeca com a busca vem primeiro', () => {
    const result = names('agachamento', 20)
    expect(result.every((n) => n.startsWith('Agachamento'))).toBe(true)
  })

  it('busca vazia nao lista nada', () => {
    expect(searchCatalog(catalog, '   ')).toEqual([])
  })

  it('monta a URL da foto', () => {
    const item = catalog.find((e) => e.english === 'Barbell Curl')!
    expect(item.image).toBe(
      'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Curl/0.jpg',
    )
    expect(catalog.find((e) => e.english === 'Kettlebell Halo')!.image).toBeNull()
  })
})
