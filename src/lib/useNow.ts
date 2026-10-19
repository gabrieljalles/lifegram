import { useEffect, useState } from 'react'

/** Relogio que anda sozinho: "em 25 min" nao pode congelar na tela. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
