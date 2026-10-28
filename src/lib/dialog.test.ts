import { describe, expect, it } from 'vitest'
import { alertDialog, answerDialog, confirmDialog, currentDialog } from './dialog'

describe('dialogos do app', () => {
  it('confirmar resolve true, cancelar resolve false, em fila', async () => {
    const first = confirmDialog({ title: 'Apagar?', danger: true })
    const second = confirmDialog({ title: 'Arquivar?' })
    expect(currentDialog()).toMatchObject({
      title: 'Apagar?',
      danger: true,
      confirmLabel: 'Confirmar',
    })
    answerDialog(true)
    expect(currentDialog()?.title).toBe('Arquivar?')
    answerDialog(false)
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
    expect(currentDialog()).toBeNull()
  })

  it('aviso tem um botão só e resolve ao fechar', async () => {
    const done = alertDialog('Dê um nome ao exercício.')
    expect(currentDialog()).toMatchObject({ kind: 'alert', confirmLabel: 'Entendi' })
    answerDialog(true)
    await expect(done).resolves.toBeUndefined()
  })
})
