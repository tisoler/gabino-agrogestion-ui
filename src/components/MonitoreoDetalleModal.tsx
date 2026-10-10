import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X, Calendar, Clock, Building2, MapPin, Sprout, ArrowUpRight } from 'lucide-react'
import { fmtFecha } from '../lib/prescripciones'

export interface MonitoreoDetalle {
  id: number
  fecha: string
  hora: string
  diagnostico: string
  observaciones: string | null
  campania?: {
    id: number
    campania?: string
    lote?: {
      id: number
      descripcion: string | null
      idEmpresa: number
      campo?: { id: number; nombre: string } | null
    } | null
    cultivo?: { id: number; nombre: string } | null
    variedad?: { id: number; nombre: string } | null
  } | null
}

interface MonitoreoDetalleModalProps {
  monitoreo: MonitoreoDetalle
  /** Nombre del productor (la lista lo resuelve; la producción lo conoce). */
  productor?: string
  onClose: () => void
}

/** Detalle de un monitoreo en solo lectura (lista y producción). */
export default function MonitoreoDetalleModal({ monitoreo, productor, onClose }: MonitoreoDetalleModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const lote = monitoreo.campania?.lote

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg shadow-xl">
        <div className="sticky top-0 z-10 px-5 py-4 border-b border-border bg-card flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold text-foreground">Monitoreo</h2>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {fmtFecha(monitoreo.fecha)} · {monitoreo.hora?.slice(0, 5)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2 min-w-0">
              <Calendar className="size-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Fecha</dt>
                <dd className="text-foreground">{fmtFecha(monitoreo.fecha)}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2 min-w-0">
              <Clock className="size-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Hora</dt>
                <dd className="text-foreground tabular-nums">{monitoreo.hora?.slice(0, 5)}</dd>
              </div>
            </div>
            {productor && (
              <div className="flex items-start gap-2 min-w-0 col-span-2">
                <Building2 className="size-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
                <div className="min-w-0">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Productor</dt>
                  <dd className="text-foreground">{productor}</dd>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2 min-w-0 col-span-2">
              <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Campo · Lote</dt>
                <dd className="text-foreground">
                  {lote?.campo?.nombre ?? 'Sin campo'} · {lote?.descripcion || (lote ? `Lote #${lote.id}` : '—')}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2 min-w-0 col-span-2">
              <Sprout className="size-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Cultivo</dt>
                <dd className="text-foreground">
                  {monitoreo.campania?.cultivo
                    ? `${monitoreo.campania.cultivo.nombre}${monitoreo.campania.variedad ? ` (${monitoreo.campania.variedad.nombre})` : ''}`
                    : '—'}
                  {monitoreo.campania?.campania ? ` · Campaña ${monitoreo.campania.campania}` : ''}
                </dd>
              </div>
            </div>
          </dl>

          <div className="space-y-1.5">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Diagnóstico</h3>
            <p className="text-sm text-foreground whitespace-pre-wrap">{monitoreo.diagnostico}</p>
          </div>

          {monitoreo.observaciones && (
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Comentarios / observaciones
              </h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{monitoreo.observaciones}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {monitoreo.campania && (
              <Link
                to={`/campanias/${monitoreo.campania.id}`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <ArrowUpRight className="size-4" strokeWidth={1.75} />
                Ver producción
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 cursor-pointer px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
