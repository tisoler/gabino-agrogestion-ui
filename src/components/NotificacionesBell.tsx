import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSWRConfig } from 'swr'
import { Bell, CheckCheck, Inbox, ArrowRight } from 'lucide-react'
import {
  useNoLeidas,
  useNotificaciones,
  useNotificacionesSSE,
  useNotificacionesActions,
  linkNotificacion,
  type Notificacion,
} from '../lib/notificaciones'

const MAX_PREVIEW = 8

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

interface NotificacionRowProps {
  n: Notificacion
  onNavigate: () => void
}

function NotificacionRow({ n, onNavigate }: NotificacionRowProps) {
  return (
    <Link
      to={linkNotificacion(n)}
      onClick={onNavigate}
      className={`flex flex-col gap-0.5 px-3 py-2.5 transition-colors ${
        n.leida ? 'bg-transparent hover:bg-accent' : 'bg-primary/5 hover:bg-primary/10'
      }`}
    >
      <span className={`text-[13px] leading-snug ${n.leida ? 'text-foreground/75' : 'text-foreground font-medium'}`}>
        {n.mensaje}
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{formatFecha(n.createdAt)}</span>
    </Link>
  )
}

export default function NotificacionesBell() {
  useNotificacionesSSE()
  const { mutate } = useSWRConfig()
  const { data: noLeidasData } = useNoLeidas()
  const { data: notificaciones = [] } = useNotificaciones()
  const { marcarLeida, marcarTodas } = useNotificacionesActions()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const noLeidas = noLeidasData?.noLeidas ?? 0
  const preview = notificaciones.slice(0, MAX_PREVIEW)

  const handleOpenNotificacion = (n: Notificacion) => {
    if (!n.leida) marcarLeida(n.id)
    setOpen(false)
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) {
      mutate('/notificaciones')
      mutate('/notificaciones/no-leidas')
    }
  }

  const close = () => setOpen(false)

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative p-2 rounded-md border border-border bg-card text-foreground hover:bg-accent transition-colors"
        aria-label={`Notificaciones${noLeidas > 0 ? ` (${noLeidas} nuevas)` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="size-4" strokeWidth={1.75} />
        {noLeidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold tabular-nums shadow">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 z-50 w-[min(22rem,calc(100vw-2rem))] bg-card border border-border rounded-lg shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Notificaciones
                {noLeidas > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold tabular-nums">
                    {noLeidas > 99 ? '99+' : noLeidas}
                  </span>
                )}
              </span>
              {noLeidas > 0 && (
                <button
                  onClick={marcarTodas}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-primary hover:bg-primary-soft transition-colors"
                >
                  <CheckCheck className="size-3.5" strokeWidth={1.75} />
                  Marcar todas leídas
                </button>
              )}
            </div>

            <div className="max-h-[22rem] overflow-y-auto divide-y divide-border/70">
              {preview.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Inbox className="size-8 text-muted-foreground/40 mb-2" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">No tenés notificaciones</p>
                </div>
              ) : (
                preview.map((n) => (
                  <NotificacionRow key={n.id} n={n} onNavigate={() => handleOpenNotificacion(n)} />
                ))
              )}
            </div>

            <div className="border-t border-border p-1.5">
              <button
                onClick={() => {
                  close()
                  navigate('/notificaciones')
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                Ver todas
                <ArrowRight className="size-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
