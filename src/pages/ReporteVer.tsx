import { useParams, Link } from 'react-router-dom'
import useSWR from 'swr'
import {
  ArrowLeft, Printer, Pencil, AlertCircle, Loader2, Building2, Calendar, FileBarChart, ClipboardList,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  TIPOS_REPORTE_LABEL, fmtPesos,
  type ReporteCalculado, type ResumenFila, type ResumenTotales,
  type DetalleFila, type DetalleTotales,
} from '../lib/reportes'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

const decimalAPct = (v: number): string => String(Math.round(v * 10000) / 100)

export default function ReporteVer() {
  const params = useParams<{ id: string }>()
  const { permisos } = useAuth()
  const canRead = permisos.includes('lectura:reporte')
  const canWrite = permisos.includes('escritura:reporte')

  const { data: reporte, error, isLoading } = useSWR<ReporteCalculado>(
    canRead && params.id ? `/reportes/${params.id}` : null,
    fetcher,
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
        <Loader2 className="size-8 text-primary mb-3 animate-spin" strokeWidth={1.75} />
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando reporte...</p>
      </div>
    )
  }

  if (error || !reporte) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">No encontrado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">El reporte no existe o no tenés acceso.</p>
        <Link to="/reportes" className="text-sm font-medium text-primary hover:underline mt-4">
          Volver a reportes
        </Link>
      </div>
    )
  }

  const esResumen = reporte.tipo === 'resumen_campania'
  const titulo = esResumen
    ? `RESUMEN CAMPAÑA ${reporte.campania}`
    : `DETALLE ASESORAMIENTO ${reporte.tipoCosecha === 'fina' ? 'FINA' : 'GRUESA'} ${reporte.campania}`

  const editUrl = esResumen
    ? `/reportes/resumen?id=${reporte.id}`
    : `/reportes/detalle?id=${reporte.id}`

  return (
    <>
      <style>{'@page { margin: 0; }'}</style>
      <div className="max-w-5xl mx-auto space-y-6 pb-20 md:pb-0 print:px-6 print:py-4">
      <div className="print-hide flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/reportes"
            className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Volver"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} />
          </Link>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">
            {TIPOS_REPORTE_LABEL[reporte.tipo]}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
          >
            <Printer className="size-4" strokeWidth={1.75} />
            Imprimir / PDF
          </button>
          {canWrite && (
            <Link
              to={editUrl}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-card text-foreground rounded-md text-sm font-medium hover:bg-accent transition-opacity"
            >
              <Pencil className="size-4" strokeWidth={1.75} />
              Editar
            </Link>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground tracking-tight">{titulo}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5" strokeWidth={1.75} />
              {reporte.empresaNombre}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" strokeWidth={1.75} />
              Campaña {reporte.campania}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {esResumen ? (
                <FileBarChart className="size-3.5" strokeWidth={1.75} />
              ) : (
                <ClipboardList className="size-3.5" strokeWidth={1.75} />
              )}
              {TIPOS_REPORTE_LABEL[reporte.tipo]}
              {!esResumen && reporte.tipoCosecha && (
                <span className="text-primary font-medium">
                  · {reporte.tipoCosecha === 'fina' ? 'Fina' : 'Gruesa'}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {esResumen ? (
            <ResumenTabla reporte={reporte} />
          ) : (
            <DetalleTabla reporte={reporte} />
          )}
        </div>
      </div>
    </div>
    </>
  )
}

function ResumenTabla({ reporte }: { reporte: ReporteCalculado }) {
  const totales = reporte.totales as ResumenTotales
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/20">
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lote</th>
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cultivo invierno</th>
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cultivo verano</th>
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Margen bruto / ha</th>
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Superficie (has)</th>
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Margen bruto lote</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {reporte.filas.map((f, i) => {
          const r = f as ResumenFila
          return (
            <tr key={i}>
              <td className="px-4 py-3 font-medium text-foreground">{r.loteNombre}</td>
              <td className="px-4 py-3 text-foreground">{r.cultivoFinaNombre || '—'}</td>
              <td className="px-4 py-3 text-foreground">{r.cultivoGruesaNombre || '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums">{fmtPesos(r.margenBrutoHa)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.superficie != null ? r.superficie : '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtPesos(r.margenBrutoLote)}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-border bg-muted/30">
          <td colSpan={5} className="px-4 py-3 text-sm text-muted-foreground">Superficie total</td>
          <td className="px-4 py-3 text-right text-sm tabular-nums font-medium">{totales.superficieTotal}</td>
        </tr>
        <tr className="bg-muted/30">
          <td colSpan={5} className="px-4 py-2 text-sm text-muted-foreground">Margen bruto total</td>
          <td className="px-4 py-2 text-right text-sm tabular-nums font-medium">{fmtPesos(totales.margenBrutoTotal)}</td>
        </tr>
        <tr className="bg-muted/30">
          <td colSpan={5} className="px-4 py-2 text-sm text-muted-foreground">Margen bruto medio / ha</td>
          <td className="px-4 py-2 text-right text-sm tabular-nums font-medium">{fmtPesos(totales.margenBrutoMedioHa)}</td>
        </tr>
        <tr className="bg-muted/30">
          <td colSpan={5} className="px-4 py-2 text-sm text-muted-foreground">EQ Soja</td>
          <td className="px-4 py-2 text-right text-sm tabular-nums font-medium">{totales.eqSoja != null ? totales.eqSoja : '—'}</td>
        </tr>
      </tfoot>
    </table>
  )
}

function DetalleTabla({ reporte }: { reporte: ReporteCalculado }) {
  const totales = reporte.totales as DetalleTotales
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/20">
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lote</th>
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cultivo</th>
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Producción (QQ)</th>
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Precio ($/QQ)</th>
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">% Asesoramiento</th>
          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Total asesoramiento</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {reporte.filas.map((f, i) => {
          const r = f as DetalleFila
          return (
            <tr key={i}>
              <td className="px-4 py-3 font-medium text-foreground">{r.loteNombre}</td>
              <td className="px-4 py-3 text-foreground">{r.cultivoNombre}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.produccionQq != null ? r.produccionQq : '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums">{fmtPesos(r.precioQq)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{decimalAPct(r.porcentajeAsesoramiento)}%</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtPesos(r.totalAsesoramiento)}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-border bg-muted/30">
          <td colSpan={5} className="px-4 py-3 text-sm text-muted-foreground">Total s/ IVA</td>
          <td className="px-4 py-3 text-right text-sm tabular-nums font-medium">{fmtPesos(totales.totalSinIva)}</td>
        </tr>
        {totales.aplicaIva && (
          <>
            <tr className="bg-muted/30">
              <td colSpan={5} className="px-4 py-2 text-sm text-muted-foreground">IVA (21%)</td>
              <td className="px-4 py-2 text-right text-sm tabular-nums font-medium">{fmtPesos(totales.iva)}</td>
            </tr>
            <tr className="bg-muted/30">
              <td colSpan={5} className="px-4 py-2 text-sm font-medium text-foreground">Total c/ IVA</td>
              <td className="px-4 py-2 text-right text-sm tabular-nums font-bold">{fmtPesos(totales.totalConIva)}</td>
            </tr>
          </>
        )}
      </tfoot>
    </table>
  )
}
