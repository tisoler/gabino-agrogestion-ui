export interface PrescripcionCampania {
  id: number
  campania?: string
  lote?: {
    id: number
    descripcion: string | null
    idEmpresa: number
    campo?: { id: number; nombre: string } | null
  } | null
  cultivo?: { id: number; nombre: string } | null
}

export interface PrescripcionListItem {
  id: number
  fecha: string
  idCampania: number
  idLabor: number
  totalHaAplicacion: number
  anulada: boolean
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

/**
 * Convierte cantidad y unidad de un insumo para la impresión.
 * La decisión se toma por fila según la cantidad por ha:
 *  - si la cantidad/ha es < 1 y la unidad es "kg" → ambas cantidades se muestran
 *    en gramos (×1000, "gr").
 *  - si la cantidad/ha es < 1 y la unidad es "lt" → ambas cantidades se muestran
 *    en cc (×1000, "cc").
 * Así la fila queda consistente (misma unidad para cantidad/ha y total).
 * Solo afecta la impresión; la vista conserva los valores originales.
 */
export function convertirUnidadImpresion(
  cantidadPorHa: number | null | undefined,
  cantidadTotal: number | null | undefined,
  unidad: string | null | undefined,
): { cantidadPorHa: number | null; cantidadTotal: number | null; unidad: string | null } {
  const u = (unidad || '').toLowerCase()
  const convertir =
    cantidadPorHa != null && Number.isFinite(cantidadPorHa) && cantidadPorHa < 1 && (u === 'kg' || u === 'lt')

  if (!convertir) {
    return {
      cantidadPorHa: cantidadPorHa ?? null,
      cantidadTotal: cantidadTotal ?? null,
      unidad: unidad ?? null,
    }
  }

  const factor = 1000
  return {
    cantidadPorHa: cantidadPorHa != null ? cantidadPorHa * factor : null,
    cantidadTotal: cantidadTotal != null ? cantidadTotal * factor : null,
    unidad: u === 'kg' ? 'gr' : 'cc',
  }
}

export const fmtFecha = (fecha: string | undefined | null): string => {
  if (!fecha) return '—'
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-AR')
}
