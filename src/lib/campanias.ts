// Tipos y helpers de cálculo para la vista Campaña.
// Mantener en sync con la planilla LOTE ESTE y con las entidades del backend.

export interface Lote {
  id: number
  idEmpresa: number
  descripcion: string | null
}

export interface Cultivo {
  id: number
  nombre: string
}

export interface Variedad {
  id: number
  idCultivo: number
  nombre: string
}

export interface LaborItem {
  id: number
  nombre: string
  idEmpresa: number | null
}

export interface InsumoItem {
  id: number
  nombre: string
  idEmpresa: number | null
}

export interface CostoItem {
  id: number
  nombre: string
  idEmpresa: number | null
}

export interface CampaniaLaborDetalle {
  id: number
  idCampania: number
  idLabor: number
  fecha: string
  superficieLaboreada: number
  costoLaborHa: number
  labor?: LaborItem
}

export interface CampaniaInsumoDetalle {
  id: number
  idCampania: number
  idInsumo: number
  unidadesHa: number
  costoUnidad: number
  insumo?: InsumoItem
}

export interface CampaniaCostoDetalle {
  id: number
  idCampania: number
  idCosto: number
  unidadesHa: number
  costoUnidad: number
  costo?: CostoItem
}

export interface Campania {
  id: number
  nombre: string
  anioDesde: number
  anioHasta: number
  idLote: number
  idCultivo: number
  idVariedad: number | null
  supSembrada: number | null
  supCosechada: number | null
  prodNetaTotalQq: number | null
  precioXQq: number | null
  alquilerQqHa: number | null
  comercializacionPct: number | null
  cosechaXHa: number | null
  lote?: Lote
  cultivo?: Cultivo
  variedad?: Variedad | null
  labores?: CampaniaLaborDetalle[]
  insumos?: CampaniaInsumoDetalle[]
  costos?: CampaniaCostoDetalle[]
  activo: boolean
}

export interface ResultadosCampania {
  rendimientoQqHa: number
  ingresoNetoHa: number
  ingresoNetoLote: number

  costoCosechaHa: number
  costoCosechaLote: number

  costoTotalLaboresHa: number
  costoTotalLaboresLote: number

  costoTotalInsumosHa: number
  costoTotalInsumosLote: number

  costoTotalCostosHa: number
  costoTotalCostosLote: number

  totalCostosDirectosHa: number
  totalCostosDirectosLote: number

  costoAlquilerHa: number
  costoAlquilerLote: number

  margenBrutoSAlquilerHa: number
  margenBrutoSAlquilerLote: number

  margenBrutoCAlquilerHa: number
  margenBrutoCAlquilerLote: number
}

const num = (v: number | null | undefined): number => (v === null || v === undefined || Number.isNaN(v) ? 0 : Number(v))

/**
 * Costo ponderado por ha de una labor individual.
 *  ponderado = (costo/ha × sup. laboreada) / sup. sembrada del lote
 *  Si no hay sup. sembrada definida, devuelve 0 para evitar NaN.
 */
export function costoPonderadoHa(labor: CampaniaLaborDetalle, supSembrada: number): number {
  if (supSembrada <= 0) return 0
  return (num(labor.costoLaborHa) * num(labor.superficieLaboreada)) / supSembrada
}

/**
 * Costo total por ha de un insumo individual (= unidades/ha × costo/unidad).
 */
export function costoTotalInsumoRowHa(item: CampaniaInsumoDetalle): number {
  return num(item.unidadesHa) * num(item.costoUnidad)
}

/**
 * Costo total por ha de un costo vario individual (= unidades/ha × costo/unidad).
 */
export function costoTotalCostoRowHa(item: CampaniaCostoDetalle): number {
  return num(item.unidadesHa) * num(item.costoUnidad)
}

/**
 * Calcula todos los indicadores de la planilla LOTE ESTE para una campaña.
 *
 *  * Ingreso neto: rendimiento (qq/ha cosechada) × precio × (1 − comerc/100)
 *  * Costos: por ha basada en sup. sembrada (labores, insumos, costos varios)
 *  * Alquiler: alquiler (qq/ha) × precio, también por ha
 *
 * Los multiplicadores para los totales por lote respetan el área relevante:
 *  * Ingreso neto, cosecha y alquiler se multiplican por sup. cosechada
 *  * Labores / insumos / costos varios se multiplican por sup. sembrada
 *  * Si las dos superficies son iguales (caso del .xls), el resultado coincide.
 */
export function calcularResultados(c: Pick<Campania,
  'supSembrada' | 'supCosechada' | 'prodNetaTotalQq' | 'precioXQq' |
  'comercializacionPct' | 'cosechaXHa' | 'alquilerQqHa' |
  'labores' | 'insumos' | 'costos'
>): ResultadosCampania {
  const supSembrada = num(c.supSembrada)
  const supCosechada = num(c.supCosechada)
  const prodNeta = num(c.prodNetaTotalQq)
  const precio = num(c.precioXQq)
  const comercPct = num(c.comercializacionPct)
  const cosechaHa = num(c.cosechaXHa)
  const alquilerQqHa = num(c.alquilerQqHa)

  const rendimientoQqHa = supCosechada > 0 ? prodNeta / supCosechada : 0
  const ingresoNetoHa = rendimientoQqHa * precio * (1 - comercPct / 100)

  const costoTotalLaboresHa = (c.labores || []).reduce(
    (acc, l) => acc + costoPonderadoHa(l, supSembrada), 0
  )
  const costoTotalInsumosHa = (c.insumos || []).reduce(
    (acc, i) => acc + costoTotalInsumoRowHa(i), 0
  )
  const costoTotalCostosHa = (c.costos || []).reduce(
    (acc, k) => acc + costoTotalCostoRowHa(k), 0
  )

  const totalCostosDirectosHa =
    cosechaHa + costoTotalLaboresHa + costoTotalInsumosHa + costoTotalCostosHa
  const margenBrutoSAlquilerHa = ingresoNetoHa - totalCostosDirectosHa
  const costoAlquilerHa = alquilerQqHa * precio
  const margenBrutoCAlquilerHa = margenBrutoSAlquilerHa - costoAlquilerHa

  return {
    rendimientoQqHa,

    ingresoNetoHa,
    ingresoNetoLote: ingresoNetoHa * supCosechada,

    costoCosechaHa: cosechaHa,
    costoCosechaLote: cosechaHa * supCosechada,

    costoTotalLaboresHa,
    costoTotalLaboresLote: costoTotalLaboresHa * supSembrada,

    costoTotalInsumosHa,
    costoTotalInsumosLote: costoTotalInsumosHa * supSembrada,

    costoTotalCostosHa,
    costoTotalCostosLote: costoTotalCostosHa * supSembrada,

    totalCostosDirectosHa,
    totalCostosDirectosLote:
      cosechaHa * supCosechada +
      costoTotalLaboresHa * supSembrada +
      costoTotalInsumosHa * supSembrada +
      costoTotalCostosHa * supSembrada,

    costoAlquilerHa,
    costoAlquilerLote: costoAlquilerHa * supCosechada,

    margenBrutoSAlquilerHa,
    margenBrutoSAlquilerLote: margenBrutoSAlquilerHa * supCosechada,

    margenBrutoCAlquilerHa,
    margenBrutoCAlquilerLote: margenBrutoCAlquilerHa * supCosechada,
  }
}

/**
 * Formatea un número con el estilo argentino: separador de miles con punto,
 * decimales con coma, sin notación científica.
 */
export function fmtNumero(value: number | null | undefined, decimales = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

export function fmtMoneda(value: number | null | undefined, decimales = 2): string {
  return '$ ' + fmtNumero(value, decimales)
}

export function fmtQQ(value: number | null | undefined, decimales = 2): string {
  return fmtNumero(value, decimales) + ' qq'
}

export function fmtQQHa(value: number | null | undefined, decimales = 2): string {
  return fmtNumero(value, decimales) + ' qq/ha'
}

export function fmtPorcentaje(value: number | null | undefined, decimales = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }) + ' %'
}

/**
 * YYYY-MM-DD en hora local (sin el corrimiento por zona horónica que produce toISOString).
 */
export function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
