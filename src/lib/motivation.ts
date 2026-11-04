/**
 * Frases que te marcaram: voce escreve na aba Coragem e elas aparecem no topo
 * da tela Hoje, uma por vez, trocando a cada vez que voce volta para la.
 */

import { putMotivationPhrase } from './db'
import { newId, nowISO, type ID, type MotivationPhrase } from './types'

/**
 * Escolhe a frase da vez. `seed` (0..1) vem do sorteio da visita; a ultima
 * mostrada fica de fora sempre que houver outra, para nunca repetir em
 * seguida. Pura: o sorteio fica com quem chama.
 */
export function pickPhrase(
  phrases: MotivationPhrase[],
  seed: number,
  lastId: ID | null,
): MotivationPhrase | null {
  if (phrases.length === 0) return null
  const pool = phrases.length > 1 ? phrases.filter((p) => p.id !== lastId) : phrases
  const index = Math.min(pool.length - 1, Math.floor(seed * pool.length))
  return pool[index]
}

/** Uma linha: espacos repetidos viram um. */
const clean = (value: string) => value.replace(/\s+/g, ' ').trim()

/** Texto da frase: mantem as quebras de linha (poema, letra), sem sobra. */
export const cleanText = (value: string) =>
  value
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export async function addPhrase(text: string, author: string): Promise<void> {
  const body = cleanText(text)
  if (!body) return
  const now = nowISO()
  await putMotivationPhrase({
    id: newId(),
    user_id: null,
    text: body,
    author: clean(author) || null,
    deleted: false,
    created_at: now,
    updated_at: now,
  })
}

export async function updatePhrase(
  phrase: MotivationPhrase,
  text: string,
  author: string,
): Promise<void> {
  const body = cleanText(text)
  if (!body) return
  await putMotivationPhrase({
    ...phrase,
    text: body,
    author: clean(author) || null,
    updated_at: nowISO(),
  })
}

/** Apagar e marcar: o outro aparelho recebe a remocao pela sincronizacao. */
export async function deletePhrase(phrase: MotivationPhrase): Promise<void> {
  await putMotivationPhrase({ ...phrase, deleted: true, updated_at: nowISO() })
}
