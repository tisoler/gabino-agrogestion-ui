import { useEffect } from 'react'
import useSWR from 'swr'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, AlertCircle, Activity, Calendar, Sprout, User, Phone, Mail,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { useVolver } from '../lib/navegacion'
import { fmtFechaHora, waLink, type MensajeMasivoDetalle } from '../lib/mensajes-masivos'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

export default function MensajeMasivoDetalle() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const volver = useVolver('/mensajes-masivos')
  const { permisos } = useAuth()
  const canRead = permisos.includes('lectura:mensaje-masivo')

  const { data: mensaje, error, isLoading } = useSWR<MensajeMasivoDetalle>(
    canRead && params.id ? `/mensajes-masivos/${params.id}` : null,
    fetcher
  )

  // Sin permiso (403) o inexistente (404): volver al listado. El BE ya
  // recorta el historial del asesor a sus propios envíos.
  useEffect(() => {
    if (error) navigate('/mensajes-masivos', { replace: true })
  }, [error, navigate])

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tienes permisos para ver esta sección.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando mensaje...</p>
      </div>
    )
  }

  if (error || !mensaje) {
    // El efecto de arriba ya redirige al listado.
    return null
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
            onClick={volver}
            className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
            aria-label="Volver"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} />
          </button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Mensaje #{mensaje.id}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Calendar className="size-3.5" strokeWidth={1.75} />
            {fmtFechaHora(mensaje.fecha)}
          </p>
        </div>
      </div>

      {/* Datos generales */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Emisor</span>
            <div className="flex items-start gap-1.5">
              <User className="size-3.5 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
              <div className="flex flex-col min-w-0">
                <span className="text-sm text-foreground">{mensaje.nombreEmisor || '—'}</span>
                <span className="text-xs text-muted-foreground">{mensaje.emailEmisor || '—'}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campaña</span>
            <p className="text-sm text-foreground">{mensaje.campania}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cultivo</span>
            <div className="flex items-center gap-1.5">
              <Sprout className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
              <p className="text-sm text-foreground">{mensaje.cultivo?.nombre || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mensaje completo */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mensaje</span>
        <p className="text-sm text-foreground whitespace-pre-line">{mensaje.mensaje}</p>
      </div>

      {/* Destinatarios */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Destinatarios
          </span>
          <span className="inline-flex items-center px-2 py-0.5 bg-accent border border-border rounded text-[11px] font-medium text-foreground">
            {mensaje.telefonosDestino.length}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Phone className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
            <span className="text-xs font-medium text-muted-foreground">Números</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {mensaje.telefonosDestino.map((tel) => (
              <a
                key={tel}
                href={waLink(tel, mensaje.mensaje)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-2 py-1 bg-background border border-border rounded text-xs text-foreground hover:border-primary transition-colors"
              >
                {tel}
              </a>
            ))}
            {mensaje.telefonosDestino.length === 0 && (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Mail className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
            <span className="text-xs font-medium text-muted-foreground">Emails</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {mensaje.emailsDestino.map((email) => (
              <span
                key={email}
                className="inline-flex items-center px-2 py-1 bg-background border border-border rounded text-xs text-foreground"
              >
                {email}
              </span>
            ))}
            {mensaje.emailsDestino.length === 0 && (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
