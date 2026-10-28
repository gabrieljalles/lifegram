import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { answerDialog, currentDialog, subscribeDialogs } from '../lib/dialog'

/**
 * Desenha o dialogo da frente da fila (confirmDialog / alertDialog). Cartao
 * centralizado, fundo opaco (sem desfoque: pesado no celular), Esc ou toque
 * fora cancela, e o botao principal ja vem focado para o Enter funcionar.
 */
export default function DialogHost() {
  const dialog = useSyncExternalStore(subscribeDialogs, currentDialog, currentDialog)

  useEffect(() => {
    if (!dialog) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') answerDialog(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  if (!dialog) return null
  const isConfirm = dialog.kind === 'confirm'

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/85 px-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) answerDialog(false)
      }}
    >
      <div
        key={dialog.id}
        role={isConfirm ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby={dialog.message ? 'app-dialog-message' : undefined}
        className="animate-pop-in w-full max-w-sm rounded-3xl border border-ink-700 bg-ink-850 p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg ${
              dialog.danger ? 'bg-fire-500/15 text-fire-400' : 'bg-brand-600/20 text-brand-400'
            }`}
          >
            {dialog.danger ? '!' : isConfirm ? '?' : 'i'}
          </span>
          <div className="min-w-0 pt-0.5">
            <p id="app-dialog-title" className="text-base font-bold leading-snug">
              {dialog.title}
            </p>
            {dialog.message && (
              <p id="app-dialog-message" className="mt-1 text-sm leading-relaxed text-ink-300">
                {dialog.message}
              </p>
            )}
          </div>
        </div>

        <div className={`mt-5 grid gap-2 ${isConfirm ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {isConfirm && (
            <button
              type="button"
              onClick={() => answerDialog(false)}
              className="rounded-xl border border-ink-600 px-4 py-3 text-sm font-semibold text-ink-100 active:bg-ink-800"
            >
              {dialog.cancelLabel}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => answerDialog(true)}
            className={`rounded-xl px-4 py-3 text-sm font-bold text-white ${
              dialog.danger ? 'bg-fire-600 active:bg-fire-500' : 'bg-brand-600 active:bg-brand-500'
            }`}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
