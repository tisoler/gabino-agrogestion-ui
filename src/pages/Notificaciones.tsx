import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Inbox, Calendar, ClipboardList } from 'lucide-react'
import {
  useNotificaciones,
  useNotificacionesActions,
  linkNotificacion,
  type Notificacion,
} from '../lib/notificaciones'

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

function NotificacionRow({ n, onOpen }: { n: Notificacion; onOpen: (n: Notificacion) => void }) {
  const Icon = n.tipo === 'prescripcion' ? ClipboardList : Calendar
  return (
    <button
      onClick={() => onOpen(n)}
      className={`w-full text-left flex items-start gap-3 p-4 transition-colors cursor-pointer ${
        n.leida ? 'bg-card hover:bg-accent' : 'bg-primary/5 hover:bg-primary/10'
      }`}
    >
      <span
        className={`inline-flex items-center justify-center size-8 rounded-md shrink-0 mt-0.5 ${
          n.leida ? 'bg-accent text-muted-foreground' : 'bg-primary-soft text-primary'
        }`}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm leading-snug ${n.leida ? 'text-foreground/75' : 'text-foreground font-medium'}`}>
          {n.mensaje}
        </span>
        <span className="block mt-1 text-[11px] text-muted-foreground tabular-nums">{formatFecha(n.createdAt)}</span>
      </span>
      {!n.leida && <span className="inline-block size-2 rounded-full bg-primary mt-2 shrink-0" aria-label="No leída" />}
    </button>
  )
}

export default function Notificaciones() {
  const { data: notificaciones = [], isLoading } = useNotificaciones()
  const { marcarLeida, marcarTodas } = useNotificacionesActions()
  const navigate = useNavigate()

  const noLeidas = notificaciones.filter((n) => !n.leida).length

  const handleOpen = (n: Notificacion) => {
    if (!n.leida) marcarLeida(n.id)
    navigate(linkNotificacion(n))
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Notificaciones</h1>
            {noLeidas > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-white text-[11px] font-bold tabular-nums">
                {noLeidas > 99 ? '99+' : noLeidas}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Producciones y prescripciones generadas sobre tus lotes
          </p>
        </div>
        {noLeidas > 0 && (
          <button
            onClick={marcarTodas}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            <CheckCheck className="size-4" strokeWidth={1.75} />
            Marcar todas como leídas
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Bell className="size-8 text-primary mx-auto mb-3 animate-pulse" strokeWidth={1.5} />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando notificaciones...</p>
          </div>
        ) : notificaciones.length === 0 ? (
          <div className="p-16 text-center">
            <Inbox className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No tenés notificaciones todavía.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notificaciones.map((n) => (
              <NotificacionRow key={n.id} n={n} onOpen={handleOpen} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
