/**
 * Dialogos de confirmacao e aviso no visual do app, no lugar do confirm() e do
 * alert() do navegador. Mesma ergonomia: `if (!(await confirmDialog(...))) return`.
 *
 * Fila simples: se dois pedidos chegam juntos, o segundo espera o primeiro.
 * Quem desenha e o <DialogHost />, montado uma vez no App.
 */

export interface DialogRequest {
  id: number
  kind: 'confirm' | 'alert'
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  /** Acao destrutiva (apagar, arquivar, encerrar): botao vermelho. */
  danger: boolean
  resolve: (ok: boolean) => void
}

let queue: DialogRequest[] = []
let nextId = 1
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((listener) => listener())

export function subscribeDialogs(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const currentDialog = (): DialogRequest | null => queue[0] ?? null

/** Fecha o dialogo da frente com a resposta e passa para o proximo da fila. */
export function answerDialog(ok: boolean) {
  const [first, ...rest] = queue
  if (!first) return
  queue = rest
  first.resolve(ok)
  emit()
}

function open(request: Omit<DialogRequest, 'id' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...request, id: nextId++, resolve }]
    emit()
  })
}

export function confirmDialog(options: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return open({
    kind: 'confirm',
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel ?? 'Confirmar',
    cancelLabel: options.cancelLabel ?? 'Cancelar',
    danger: options.danger ?? false,
  })
}

export async function alertDialog(title: string, message?: string): Promise<void> {
  await open({
    kind: 'alert',
    title,
    message,
    confirmLabel: 'Entendi',
    cancelLabel: '',
    danger: false,
  })
}
