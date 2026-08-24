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
 * Conversión de cantidad y unidad para mostrar (columna "Dosis" y
 * "Cantidad total").
 *
 * La conversión a gr/cc (×1000) se evalúa de forma INDEPENDIENTE para cada
 * valor: si el valor es < 1 y la unidad original es "kg" o "lt", se muestra
 * en gramos/cc. Así una dosis de 0,5 lt se ve "500 cc" aunque el total sea
 * 150 lt (que se sigue viendo "150 lt").
 */
export function convertirUnidadImpresionValor(
  valor: number | null | undefined,
  unidad: string | null | undefined,
): { valor: number | null; unidad: string | null } {
  const u = (unidad || '').toLowerCase()
  if (u !== 'kg' && u !== 'lt') {
    return {
      valor: valor ?? null,
      unidad: u ? (u === 'unidad' ? 'u' : (unidad ?? null)) : null,
    }
  }
  if (valor != null && Number.isFinite(valor) && valor < 1) {
    return { valor: valor * 1000, unidad: u === 'kg' ? 'gr' : 'cc' }
  }
  return { valor: valor ?? null, unidad: u }
}

/**
 * Formatea un valor con su unidad (ej. "0,5 kg" o "500 cc"). Sin unidad
 * devuelve sólo el número. Con `perHa` agrega "/ha" a la unidad (columna
 * Dosis: cantidad por hectárea).
 */
export function fmtDosisCantidad(
  valor: number | null | undefined,
  unidad: string | null | undefined,
  decimales = 2,
  perHa = false,
): string {
  const c = convertirUnidadImpresionValor(valor, unidad)
  const numero = fmtCantidad(c.valor, decimales)
  if (!c.unidad) return numero
  return `${numero} ${c.unidad}${perHa ? '/ha' : ''}`
}

export const fmtFecha = (fecha: string | undefined | null): string => {
  if (!fecha) return '—'
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-AR')
}
