import { useEffect, useState } from 'react'
import { getPhotoBlob, putPhotoBlob } from './db'
import type { Exercise, ID } from './types'

/**
 * A foto existe para voce reconhecer o aparelho de relance, nao para ser
 * bonita. Entao comprimimos agressivamente: quanto menor, mais rapido ela
 * aparece no meio do treino e menos espaco ocupa no aparelho e na nuvem.
 */
const MAX_DIMENSION = 640
const QUALITY = 0.55

/**
 * Reduz a foto da camera (tipicamente 3-6 MB) para algo na casa de dezenas de
 * KB. Isso importa duas vezes: cabe no free tier do Storage e a imagem abre
 * instantaneamente no meio do treino.
 */
export async function compressImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', QUALITY)
  })
  if (blob) return blob

  // Safari antigo nao exporta webp: caimos para jpeg.
  const jpeg = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
  })
  return jpeg ?? file
}

export const photoKeyFor = (exercise_id: ID): string => `exercise/${exercise_id}`

/** Comprime e guarda a foto localmente; devolve a chave do blob. */
export async function savePhotoLocally(exercise_id: ID, file: File | Blob): Promise<string> {
  const blob = await compressImage(file)
  const key = photoKeyFor(exercise_id)
  await putPhotoBlob(key, blob)
  return key
}

/* Cache de object URLs: criar um por render vazaria memoria do navegador. */
const urlCache = new Map<string, string>()

export async function photoURL(exercise: Exercise): Promise<string | null> {
  if (exercise.photo_local_key) {
    const cached = urlCache.get(exercise.photo_local_key)
    if (cached) return cached

    const blob = await getPhotoBlob(exercise.photo_local_key)
    if (blob) {
      const url = URL.createObjectURL(blob)
      urlCache.set(exercise.photo_local_key, url)
      return url
    }
  }
  // Sem blob local (ex.: outro aparelho) usamos a copia da nuvem.
  return exercise.photo_url ?? null
}

export function invalidatePhotoURL(key: string) {
  const url = urlCache.get(key)
  if (url) {
    URL.revokeObjectURL(url)
    urlCache.delete(key)
  }
}

export function usePhotoURL(exercise: Exercise | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!exercise) {
      setUrl(null)
      return
    }
    void photoURL(exercise).then((value) => {
      if (!cancelled) setUrl(value)
    })
    return () => {
      cancelled = true
    }
  }, [exercise?.id, exercise?.photo_local_key, exercise?.photo_url])

  return url
}
