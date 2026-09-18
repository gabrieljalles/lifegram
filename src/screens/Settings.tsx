import { useRef, useState } from 'react'
import { Button, Card, Header, Section } from '../components/ui'
import { exportBackup, importBackup, type Backup } from '../lib/db'
import { useApp } from '../lib/store'
import { isSupabaseConfigured, signInWithEmail, signOut } from '../lib/supabase'
import { notificationPermission, requestNotificationPermission } from '../lib/timer'

const STATUS_TEXT: Record<string, { label: string; tone: string }> = {
  local: { label: 'Somente neste aparelho', tone: 'text-ink-300' },
  'signed-out': { label: 'Nuvem disponível — faça login para sincronizar', tone: 'text-pr-400' },
  synced: { label: 'Tudo sincronizado', tone: 'text-go-400' },
  pending: { label: 'Alterações na fila para subir', tone: 'text-pr-400' },
  offline: { label: 'Sem conexão — dados salvos no aparelho', tone: 'text-ink-300' },
  error: { label: 'Falha ao sincronizar — tentaremos de novo', tone: 'text-fire-400' },
}

export default function Settings() {
  const { userEmail, syncStatus, pendingCount, syncNow, reload, sessions, setLogs, exercises } =
    useApp()
  const fileInput = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notifyState, setNotifyState] = useState(() => notificationPermission())

  const status = STATUS_TEXT[syncStatus] ?? STATUS_TEXT.local

  const login = async () => {
    if (!email.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      await signInWithEmail(email.trim())
      setMessage('Link de acesso enviado. Abra o e-mail neste aparelho para entrar.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar o link.')
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    const backup = await exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `workout-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const restore = async (file: File) => {
    setBusy(true)
    try {
      const parsed = JSON.parse(await file.text()) as Backup
      const applied = await importBackup(parsed)
      await reload()
      setMessage(`${applied} registros importados.`)
    } catch {
      setMessage('Arquivo inválido. Use um backup exportado por este app.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Header title="Ajustes" />

      <Section title="Sincronização">
        <Card className="p-4">
          <p className={`text-sm font-semibold ${status.tone}`}>{status.label}</p>
          {pendingCount > 0 && (
            <p className="tnum mt-0.5 text-xs text-ink-400">{pendingCount} alterações na fila</p>
          )}
          {userEmail && <p className="mt-1 text-xs text-ink-400">Conectado como {userEmail}</p>}

          {!isSupabaseConfigured && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              A nuvem não está configurada nesta instalação. O app funciona normalmente e guarda
              tudo no aparelho — use o backup em JSON para não perder nada ao trocar de celular.
            </p>
          )}

          {isSupabaseConfigured && !userEmail && (
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="email"
                inputMode="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
              />
              <Button variant="primary" onClick={login} disabled={busy}>
                Enviar link de acesso
              </Button>
              <p className="text-[11px] text-ink-400">
                Sem senha: você recebe um link por e-mail e entra com um toque.
              </p>
            </div>
          )}

          {isSupabaseConfigured && userEmail && (
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void syncNow()}>
                Sincronizar agora
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut()
                  await reload()
                }}
              >
                Sair
              </Button>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Aviso de descanso">
        <Card className="p-4">
          <p className="text-sm leading-relaxed text-ink-300">
            Quando o descanso acabar, o app apita e vibra. Com a permissão de notificações, você
            também recebe um aviso na tela de bloqueio — útil para guardar o celular no bolso entre
            as séries.
          </p>

          {notifyState === 'unsupported' && (
            <p className="mt-2 text-[11px] text-ink-400">
              Este navegador não suporta notificações. O apito e a vibração continuam funcionando.
            </p>
          )}
          {notifyState === 'granted' && (
            <p className="mt-2 text-xs font-semibold text-go-400">Notificações liberadas.</p>
          )}
          {notifyState === 'denied' && (
            <p className="mt-2 text-[11px] leading-relaxed text-fire-400">
              Notificações bloqueadas. Para liberar, ajuste as permissões do site nas configurações
              do navegador.
            </p>
          )}
          {notifyState === 'default' && (
            <Button
              className="mt-3"
              variant="primary"
              onClick={async () => {
                const result = await requestNotificationPermission()
                setNotifyState(result)
              }}
            >
              Ativar notificações
            </Button>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
            No iPhone, notificações só funcionam com o app instalado na Tela de Início.
          </p>
        </Card>
      </Section>

      <Section title="Backup">
        <Card className="p-4">
          <p className="text-sm leading-relaxed text-ink-300">
            Exporte um arquivo JSON com treinos, exercícios e todo o histórico. Serve como rede de
            segurança e para migrar de aparelho.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={download}>
              Exportar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
              Importar
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void restore(file)
              event.target.value = ''
            }}
          />
        </Card>
      </Section>

      <Section title="Seus dados">
        <Card className="tnum flex flex-col gap-1 p-4 text-sm text-ink-300">
          <p>
            {exercises.length} exercícios cadastrados
          </p>
          <p>{sessions.filter((s) => s.finished_at).length} treinos concluídos</p>
          <p>{setLogs.length} séries registradas</p>
        </Card>
      </Section>

      {message && (
        <div className="px-4 pb-4">
          <p className="rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-xs text-ink-200">
            {message}
          </p>
        </div>
      )}

      <Section title="Instalar no celular">
        <Card className="p-4 text-sm leading-relaxed text-ink-300">
          No Chrome (Android), abra o menu e toque em <strong>Instalar app</strong>. No iPhone, use
          o botão de compartilhar do Safari e <strong>Adicionar à Tela de Início</strong>. Instalado,
          o app abre em tela cheia e funciona sem internet.
        </Card>
      </Section>
    </div>
  )
}
