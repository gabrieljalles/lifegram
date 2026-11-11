import type { Activity, ItemType } from './types'

/**
 * Tipos de item da agenda. Tudo que acontece no dia e um item; o tipo so
 * muda o rotulo, a acao na tela Hoje e como ele aparece nos Padroes.
 */
export const ITEM_TYPES: Array<{ id: ItemType; label: string; tag: string; icon: string }> = [
  { id: 'habito', label: 'Hábito', tag: 'HÁBITO', icon: '⭐' },
  { id: 'remedio', label: 'Remédio ou suplemento', tag: 'REMÉDIO', icon: '💊' },
  { id: 'compromisso', label: 'Compromisso', tag: 'COMPROMISSO', icon: '📌' },
  { id: 'tarefa', label: 'Tarefa ou objetivo', tag: 'TAREFA', icon: '🎯' },
  { id: 'coragem', label: 'Coragem', tag: 'CORAGEM', icon: '🦁' },
  { id: 'treino', label: 'Treino', tag: 'TREINO', icon: '🏋️' },
]

export const itemTypeMeta = (type: ItemType) => ITEM_TYPES.find((t) => t.id === type)!

/**
 * Tipo do item. Linhas de antes da v2 nao tem o campo: o icone de pilula
 * vira remedio, a de um dia so vira compromisso, o resto e habito.
 */
export function itemTypeOf(activity: Pick<Activity, 'item_type' | 'icon' | 'kind'>): ItemType {
  if (activity.item_type) return activity.item_type
  if (activity.icon === '💊') return 'remedio'
  if (activity.icon === '🦁') return 'coragem'
  if (activity.kind === 'esporadica') return 'compromisso'
  return 'habito'
}
