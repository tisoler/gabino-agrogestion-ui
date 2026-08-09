export interface PrescripcionCampania {
  id: number
  nombre: string
  lote?: { id: number; descripcion: string | null; idEmpresa: number } | null
  cultivo?: { id: number; nombre: string } | null
}

export interface PrescripcionListItem {
  id: number
  fecha: string
  idCampania: number
  idLabor: number
  totalHaAplicacion: number
  campania: PrescripcionCampania | null
  labor: { id: number; nombre: string } | null
  insumoCount: number
}

export interface PrescripcionInsumo {
  id: number
  idPrescripcion: number
  idInsumo: number
  cantidadPorHa: number
  cantidadTotal: number
  insumo?: { id: number; nombre: string; unidad?: string | null } | null
}

export interface Prescripcion extends Omit<PrescripcionListItem, 'insumoCount'> {
  insumos: PrescripcionInsumo[]
}

export const fmtHa = (v: number | null | undefined, decimales = 2): string =>
  v == null || Number.isNaN(v) ? '—' : `${v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: decimales })} ha`

export const fmtCantidad = (v: number | null | undefined, decimales = 2): string =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: decimales })

export const fmtFecha = (fecha: string | undefined | null): string => {
  if (!fecha) return '—'
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-AR')
}
