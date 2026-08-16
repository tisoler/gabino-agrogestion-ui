import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import {
  FileBarChart, AlertCircle, Trash2, Pencil, ClipboardList, Loader2,
  Building2, Calendar,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import {
  TIPOS_REPORTE_LABEL,
  TIPO_REPORTE_TAG_COLORS,
  TIPO_REPORTE_BUTTON_COLORS,
  eliminarReporte,
  type ReporteListItem,
} from '../lib/reportes'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

export default function Reportes() {
  const navigate = useNavigate()
  const { permisos } = useAuth()
  const canRead = permisos.includes('lectura:reporte')
  const canWrite = permisos.includes('escritura:reporte')

  const { data: reportes = [], isLoading, mutate } = useSWR<ReporteListItem[]>(
    canRead ? '/reportes' : null,
    fetcher,
  )
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const goToVer = (r: ReporteListItem) => {
    navigate(`/reportes/ver/${r.id}`)
  }

  const goToEditar = (r: ReporteListItem) => {
    const base = r.tipo === 'resumen_campania' ? '/reportes/resumen' : '/reportes/detalle'
    navigate(`${base}?id=${r.id}`)
  }

  const handleEliminar = async (r: ReporteListItem) => {
    if (!window.confirm(`¿Eliminar el reporte "${TIPOS_REPORTE_LABEL[r.tipo]}" de ${r.empresaNombre}?`)) return
    setDeletingId(r.id)
    try {
      await eliminarReporte(r.id)
      mutate()
    } catch (e) {
      console.error('Error al eliminar reporte', e)
    } finally {
      setDeletingId(null)
    }
  }

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tienes permisos para ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Resumen de campaña y detalle de asesoramiento por productor
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => navigate('/reportes/resumen')}
              className={`inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium transition-opacity cursor-pointer ${TIPO_REPORTE_BUTTON_COLORS.resumen_campania}`}
            >
              <FileBarChart className="size-4" strokeWidth={1.75} />
              Nuevo Resumen Campaña
            </button>
            <button
              onClick={() => navigate('/reportes/detalle')}
              className={`inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium transition-opacity cursor-pointer ${TIPO_REPORTE_BUTTON_COLORS.detalle_asesoramiento}`}
            >
              <ClipboardList className="size-4" strokeWidth={1.75} />
              Nuevo Detalle asesoramiento
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Loader2 className="size-8 text-primary mb-3 animate-spin" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando reportes...</p>
        </div>
      ) : reportes.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-16 text-center">
          <FileBarChart className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">No hay reportes cargados todavía.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Productor</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Campaña</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Filas</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actualizado</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reportes.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => goToVer(r)}
                    className="hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border rounded text-[11px] font-medium ${TIPO_REPORTE_TAG_COLORS[r.tipo]}`}>
                        {r.tipo === 'detalle_asesoramiento' ? (
                          <ClipboardList className="size-3" strokeWidth={1.75} />
                        ) : (
                          <FileBarChart className="size-3" strokeWidth={1.75} />
                        )}
                        {TIPOS_REPORTE_LABEL[r.tipo]}
                      </span>
                      {r.tipo === 'detalle_asesoramiento' && r.tipoCosecha && (
                        <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-primary-soft text-primary">
                          {r.tipoCosecha === 'fina' ? 'Fina' : 'Gruesa'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Building2 className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <span className="text-sm text-foreground truncate">{r.empresaNombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <span className="text-sm text-foreground">{r.campania}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{r.filaCount}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(r.updatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); goToEditar(r) }}
                          className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors cursor-pointer"
                          title="Editar"
                          aria-label="Editar"
                        >
                          <Pencil className="size-3.5" strokeWidth={1.75} />
                        </button>
                        {canWrite && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEliminar(r) }}
                            disabled={deletingId === r.id}
                            className="p-1.5 rounded-md text-destructive hover:bg-destructive-soft transition-colors disabled:opacity-50 cursor-pointer"
                            title="Eliminar"
                            aria-label="Eliminar"
                          >
                            {deletingId === r.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" strokeWidth={1.75} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
