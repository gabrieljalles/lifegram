import { useEffect } from 'react'
import type { AppSettings } from './types'

/** Da noite: das 19h as 6h a agenda vira capa azul-marinho. */
export const isNightHour = (hour: number) => hour >= 19 || hour < 6

export function themeFor(setting: AppSettings['theme'], now = new Date()): 'day' | 'night' {
  if (setting === 'dia') return 'day'
  if (setting === 'noite') return 'night'
  return isNightHour(now.getHours()) ? 'night' : 'day'
}

const THEME_COLOR = { day: '#fbfaf6', night: '#10183a' }

/** Aplica o tema no <html> e na barra do sistema; `now` faz virar sozinho. */
export function useTheme(setting: AppSettings['theme'], now: Date) {
  const theme = themeFor(setting, now)
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'night') root.dataset.theme = 'night'
    else delete root.dataset.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  }, [theme])
  return theme
}
