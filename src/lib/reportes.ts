import api from './api'

export type TipoReporte = 'resumen_campania' | 'detalle_asesoramiento'
export type TipoCosecha = 'fina' | 'gruesa'

export const TIPOS_REPORTE_LABEL: Record<TipoReporte, string> = {
  resumen_campania: 'Resumen Campaña',
  detalle_asesoramiento: 'Detalle asesoramiento',
}

/** Colores de tag por tipo de reporte (coinciden con los botones "Nuevo"). */
export const TIPO_REPORTE_TAG_COLORS: Record<TipoReporte, string> = {
  resumen_campania: 'bg-blue-100 text-blue-700 border-blue-200',
  detalle_asesoramiento: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

/** Colores de botón "Nuevo" por tipo de reporte (misma base que el tag). */
export const TIPO_REPORTE_BUTTON_COLORS: Record<TipoReporte, string> = {
  resumen_campania: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200',
  detalle_asesoramiento: 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200',
}

export const TIPO_COSECHA_LABEL: Record<TipoCosecha, string> = {
  fina: 'Fina (invierno)',
  gruesa: 'Gruesa (verano)',
}

export interface FilaReportePayload {
  idLote: number
  idProduccion?: number
  idProduccionFina?: number
  idProduccionGruesa?: number
  porcentajeAsesoramiento?: number
}

export interface CreateReportePayload {
  idEmpresa: number
  campania: string
  tipo: TipoReporte
  tipoCosecha?: TipoCosecha
  asesoramientoPorcentaje?: number
  aplicaIva?: boolean
  filas: FilaReportePayload[]
}

export interface ResumenFila {
  id: number | null
  idLote: number
  loteNombre: string
  campoNombre: string | null
  idProduccionFina: number | null
  cultivoFinaNombre: string | null
  idProduccionGruesa: number | null
  cultivoGruesaNombre: string | null
  margenBrutoHa: number | null
  superficie: number | null
  margenBrutoLote: number | null
}

export interface ResumenTotales {
  superficieTotal: number
  margenBrutoTotal: number
  margenBrutoMedioHa: number
  eqSoja: number | null
}

export interface DetalleFila {
  id: number | null
  idLote: number
  loteNombre: string
  campoNombre: string | null
  idProduccion: number | null
  cultivoNombre: string
  produccionQq: number | null
  precioQq: number | null
  porcentajeAsesoramiento: number
  totalAsesoramiento: number | null
}

export interface DetalleTotales {
  totalSinIva: number
  iva: number
  totalConIva: number
  aplicaIva: boolean
}

export interface ReporteCalculado {
  id: number | null
  idEmpresa: number
  empresaNombre: string
  campania: string
  tipo: TipoReporte
  tipoCosecha: TipoCosecha | null
  asesoramientoPorcentaje: number | null
  aplicaIva: boolean
  filas: (ResumenFila | DetalleFila)[]
  totales: ResumenTotales | DetalleTotales
}

export interface ReporteListItem {
  id: number
  idEmpresa: number
  empresaNombre: string
  campania: string
  tipo: TipoReporte
  tipoCosecha: TipoCosecha | null
  asesoramientoPorcentaje: number | null
  aplicaIva: boolean
  filaCount: number
  createdAt: string
  updatedAt: string
}

/** Producción candidata para los selectores de los builders de reportes. */
export interface ProduccionCandidata {
  id: number
  idLote: number
  loteDescripcion: string
  campoNombre: string | null
  idCultivo: number
  cultivoNombre: string
  tipoCosecha: TipoCosecha | null
  supSembrada: number
  margenBrutoSAlquilerLote: number
  produccionQq: number
  precioXQq: number
}

export interface ProduccionLote {
  id: number
  descripcion: string | null
  campoNombre: string | null
}

export interface ProduccionesReporte {
  lotes: ProduccionLote[]
  producciones: ProduccionCandidata[]
}

export async function getProducciones(
  empresaId: number,
  campania: string,
): Promise<ProduccionesReporte> {
  const { data } = await api.get('/reportes/producciones', {
    params: { empresaId, campania },
  })
  return data
}

export async function crearReporte(payload: CreateReportePayload): Promise<ReporteCalculado> {
  const { data } = await api.post('/reportes', payload)
  return data
}

export async function actualizarReporte(id: number, payload: CreateReportePayload): Promise<ReporteCalculado> {
  const { data } = await api.patch(`/reportes/${id}`, payload)
  return data
}

export async function eliminarReporte(id: number): Promise<void> {
  await api.delete(`/reportes/${id}`)
}

export const mensajeError = (e: unknown, fallback: string): string => {
  const err = e as { response?: { data?: { message?: string | string[] } } }
  const msg = err?.response?.data?.message
  if (Array.isArray(msg)) return msg.join(', ')
  if (typeof msg === 'string') return msg
  return fallback
}

export const fmtPesos = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `$${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
