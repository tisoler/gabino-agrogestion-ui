import { useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, AlertCircle, Activity, Calendar, Building2, MapPin,
  Sprout, Pickaxe, Package, Lock, Printer, Ban, ArrowRight, LandPlot, RotateCcw,
} from 'lucide-react'
import api, { esErrorDeAcceso } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { fmtFecha, fmtHa, fmtDosisCantidad, type Prescripcion } from '../lib/prescripciones'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

export default function PrescripcionDetalle() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { permisos, empresas } = useAuth()
  const canRead = permisos.includes('lectura:prescripcion')
  const canWrite = permisos.includes('escritura:prescripcion')
  const [toggling, setToggling] = useState(false)

  const { data: prescripcion, error, isLoading } = useSWR<Prescripcion>(
    canRead && params.id ? `/prescripciones/${params.id}` : null,
    fetcher
  )

  // Sin permiso sobre la empresa (403), inexistente (404) o sin sesión (401):
  // volver al listado.
  useEffect(() => {
    if (error && esErrorDeAcceso(error)) navigate('/prescripciones', { replace: true })
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
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando prescripción...</p>
      </div>
    )
  }

  if (error || !prescripcion) {
    if (error && esErrorDeAcceso(error)) return null // redirigiendo al listado
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

  const idEmpresa = prescripcion.campania?.lote?.idEmpresa
  const empresa = idEmpresa != null
    ? { id: idEmpresa, nombre: empresas.find((e) => e.id === idEmpresa)?.nombre || `Productor #${idEmpresa}` }
    : null

  const handleToggleAnulada = async () => {
    if (!canWrite || toggling) return
    if (typeof window !== 'undefined' && !window.confirm(
      prescripcion.anulada
        ? `¿Desea recuperar la prescripción #${prescripcion.id}?`
        : `¿Desea anular la prescripción #${prescripcion.id}?`,
    )) return
    setToggling(true)
    try {
      await api.patch(`/prescripciones/${prescripcion.id}/anulada`, {
        anulada: !prescripcion.anulada,
      })
      await mutate(`/prescripciones/${prescripcion.id}`)
      // Al anular/recuperar se quitan/reincorporan labor e insumos a la
      // producción: revalidar la cache SWR de producciones.
      await mutate(
        (key) =>
          (typeof key === 'string' && key.startsWith('/campanias')) ||
          (Array.isArray(key) && key[0] === 'campanias'),
        undefined,
        { revalidate: true },
      )
    } catch (e) {
      console.error('No se pudo actualizar la prescripción', e)
    } finally {
      setToggling(false)
    }
  }

  return (
    <>
      <style>{'@page { margin: 0; }'}</style>
      <div className="max-w-3xl mx-auto space-y-6 pb-20 md:pb-0 print-hide">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Link
              to="/prescripciones"
              className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Volver"
            >
              <ArrowLeft className="size-4" strokeWidth={1.75} />
            </Link>
            <div className="flex gap-3">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                Prescripción #{prescripcion.id}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <Calendar className="size-3.5" strokeWidth={1.75} />
                {fmtFecha(prescripcion.fecha)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end items-center gap-2">
            {prescripcion.anulada && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-destructive/10 border border-destructive/20 rounded-md text-[10px] font-semibold uppercase tracking-wider text-destructive">
                <Ban className="size-3" strokeWidth={2} />
                Anulada
              </span>
            )}
            {canWrite && (
              <button
                onClick={handleToggleAnulada}
                disabled={toggling}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${prescripcion.anulada
                  ? 'text-primary border-primary/30 hover:bg-primary/10'
                  : 'text-destructive border-destructive/30 hover:bg-destructive/10'
                  }`}
              >
                {toggling ? (
                  <Activity className="size-3.5 animate-spin" strokeWidth={2} />
                ) : prescripcion.anulada ? (
                  <RotateCcw className="size-3.5" strokeWidth={2} />
                ) : (
                  <Ban className="size-3.5" strokeWidth={2} />
                )}
                {toggling ? 'Procesando…' : prescripcion.anulada ? 'Recuperar' : 'Anular'}
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Printer className="size-4" strokeWidth={1.75} />
              Imprimir / PDF
            </button>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent border border-border rounded-md text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Lock className="size-3" strokeWidth={2} />
              Guardada · solo lectura
            </span>
          </div>
        </div>

        {/* Lote */}
        <section className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Datos de la producción</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                Campo
              </p>
              <p className="text-sm text-foreground">{prescripcion.campania?.lote?.campo?.nombre || '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <LandPlot className="size-3 shrink-0" strokeWidth={2} />
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

            {prescripcion.campania && (
              <div className="flex justify-end">
                <Link
                  to={`/campanias/${prescripcion.campania.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-card text-foreground rounded-md text-sm font-medium hover:bg-accent transition-opacity cursor-pointer"
                >
                  <ArrowRight className="size-4" strokeWidth={1.75} />
                  Ir a la producción
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Labor */}
        <section className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Pickaxe className="size-4 text-primary" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Labor y superficie</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Pickaxe className="size-3 shrink-0" strokeWidth={2} />
                Labor
              </p>
              <p className="text-sm text-foreground">{prescripcion.labor?.nombre || `Labor #${prescripcion.idLabor}`}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <LandPlot className="size-3 shrink-0" strokeWidth={2} />
                Total ha para aplicación
              </p>
              <p className="text-sm text-foreground">{fmtHa(prescripcion.totalHaAplicacion)}</p>
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
                    <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                      Dosis
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
                      <td className="px-4 py-3 text-right tabular-nums">{fmtDosisCantidad(i.cantidadPorHa, i.insumo?.unidad, 3)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtDosisCantidad(i.cantidadTotal, i.insumo?.unidad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Vista de impresión: media hoja A4 vertical con membrete y pie */}
      <div className="print-prescripcion">
        <div className="prescripcion-print-membrete">
          <img src="/membrete.png" alt="Membrete" />
        </div>

        <div className="prescripcion-print-body">
          <div className="prescripcion-print-titulo">
            <h1>Prescripción</h1>
            <p>{fmtFecha(prescripcion.fecha)}</p>
          </div>

          <dl className="prescripcion-print-datos">
            <div>
              <dt>Productor</dt>
              <dd>{empresa?.nombre || '—'}</dd>
            </div>
            <div>
              <dt>Campo</dt>
              <dd>{prescripcion.campania?.lote?.campo?.nombre || '—'}</dd>
            </div>
            <div>
              <dt>Lote</dt>
              <dd>
                {prescripcion.campania?.lote?.descripcion || `Lote #${prescripcion.campania?.lote?.id ?? '—'}`}
              </dd>
            </div>
            <div>
              <dt>Cultivo</dt>
              <dd>{prescripcion.campania?.cultivo?.nombre || '—'}</dd>
            </div>
            <div>
              <dt>Labor</dt>
              <dd>{prescripcion.labor?.nombre || `Labor #${prescripcion.idLabor}`}</dd>
            </div>
            <div>
              <dt>Superficie</dt>
              <dd>{fmtHa(prescripcion.totalHaAplicacion)}</dd>
            </div>
          </dl>

          <table className="prescripcion-print-tabla">
            <thead>
              <tr>
                <th>Insumo</th>
                <th className="text-right">Dosis</th>
                <th className="text-right">Cantidad total</th>
              </tr>
            </thead>
            <tbody>
              {prescripcion.insumos.length === 0 ? (
                <tr>
                  <td colSpan={3}>Esta prescripción no tiene insumos.</td>
                </tr>
              ) : (
                prescripcion.insumos.map((i) => (
                  <tr key={i.id}>
                    <td>{i.insumo?.nombre || `Insumo #${i.idInsumo}`}</td>
                    <td className="text-right">{fmtDosisCantidad(i.cantidadPorHa, i.insumo?.unidad, 2)}</td>
                    <td className="text-right">{fmtDosisCantidad(i.cantidadTotal, i.insumo?.unidad, 2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="prescripcion-print-pie">
          <img src="/pie.png" alt="Pie" />
        </div>
      </div>
    </>
  )
}