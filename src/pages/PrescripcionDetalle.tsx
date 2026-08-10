import useSWR from 'swr'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, AlertCircle, Activity, Calendar, Building2, MapPin,
  Sprout, Pickaxe, Package, Lock,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { fmtFecha, fmtHa, fmtCantidad, type Prescripcion } from '../lib/prescripciones'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

export default function PrescripcionDetalle() {
  const params = useParams<{ id: string }>()
  const { permisos } = useAuth()
  const canRead = permisos.includes('lectura:prescripcion')

  const { data: prescripcion, error, isLoading } = useSWR<Prescripcion>(
    canRead && params.id ? `/prescripciones/${params.id}` : null,
    fetcher
  )

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
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando prescripción...</p>
      </div>
    )
  }

  if (error || !prescripcion) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">No encontrada</h2>
        <p className="text-sm text-muted-foreground mt-1.5">La prescripción no existe o no tenés acceso.</p>
        <Link to="/prescripciones" className="text-sm font-medium text-primary hover:underline mt-4">
          Volver a prescripciones
        </Link>
      </div>
    )
  }

  const empresa = prescripcion.campania?.lote
    ? { id: prescripcion.campania.lote.idEmpresa, nombre: `Productor #${prescripcion.campania.lote.idEmpresa}` }
    : null

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/prescripciones"
            className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Volver"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Prescripción #{prescripcion.id}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <Calendar className="size-3.5" strokeWidth={1.75} />
              {fmtFecha(prescripcion.fecha)}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent border border-border rounded-md text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Lock className="size-3" strokeWidth={2} />
          Guardada · solo lectura
        </span>
      </div>

      {/* Lote */}
      <section className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider text-muted-foreground">
          Lote en campaña
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Calendar className="size-3 shrink-0" strokeWidth={2} />
              Identificador de producción
            </p>
            <div className="text-sm">
              {prescripcion.campania ? (
                <Link
                  to={`/campanias/${prescripcion.campania.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {prescripcion.campania.nombre || `Producción #${prescripcion.campania.id}`}
                </Link>
              ) : (
                <span className="font-medium text-foreground">—</span>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Calendar className="size-3 shrink-0" strokeWidth={2} />
              Campaña
            </p>
            <p className="text-sm text-foreground">{prescripcion.campania?.campania || '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Building2 className="size-3 shrink-0" strokeWidth={2} />
              Productor
            </p>
            <p className="text-sm text-foreground">{empresa?.nombre || '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <MapPin className="size-3 shrink-0" strokeWidth={2} />
              Lote
            </p>
            <p className="text-sm text-foreground">
              {prescripcion.campania?.lote?.descripcion || `Lote #${prescripcion.campania?.lote?.id ?? '—'}`}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Sprout className="size-3 shrink-0" strokeWidth={2} />
              Cultivo
            </p>
            <p className="text-sm text-foreground">{prescripcion.campania?.cultivo?.nombre || '—'}</p>
          </div>
        </div>
      </section>

      {/* Labor */}
      <section className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider text-muted-foreground">
          Aplicación
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Pickaxe className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
            <span className="text-sm text-foreground">{prescripcion.labor?.nombre || `Labor #${prescripcion.idLabor}`}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
            <span className="text-sm text-foreground">{fmtHa(prescripcion.totalHaAplicacion)}</span>
          </div>
        </div>
      </section>

      {/* Insumos */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
          <Package className="size-4 text-primary" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Insumos</h2>
        </div>
        {prescripcion.insumos.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Esta prescripción no tiene insumos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-left">
                    Insumo
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-left">
                    Unidad
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Cantidad / ha
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Cantidad total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {prescripcion.insumos.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {i.insumo?.nombre || `Insumo #${i.idInsumo}`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{i.insumo?.unidad || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtCantidad(i.cantidadPorHa)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtCantidad(i.cantidadTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}