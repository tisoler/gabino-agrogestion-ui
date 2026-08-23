// Tipos y helpers de cálculo para la vista Campaña.
// Mantener en sync con la planilla LOTE ESTE y con las entidades del backend.

export interface Lote {
  id: number
  idEmpresa: number
  descripcion: string | null
  idCampo?: number | null
  campo?: { id: number; nombre: string } | null
}

export interface Cultivo {
  id: number
  nombre: string
  tipoCosecha?: 'fina' | 'gruesa' | null
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
  precioUnitario?: number | null
}

export interface CategoriaInsumoItem {
  id: number
  nombre: string
  descripcion: string | null
  activo?: boolean
}

export interface InsumoItem {
  id: number
  nombre: string
  idEmpresa: number | null
  precioUnitario?: number | null
  idCategoria?: number | null
  categoria?: { id: number; nombre: string } | null
}

export interface CostoItem {
  id: number
  nombre: string
  idEmpresa: number | null
  precioUnitario?: number | null
}

export interface CampaniaLaborDetalle {
  id: number
  idCampania: number
  idLabor: number | null
  fecha: string
  superficieLaboreada: number
  costoLaborHa: number
  observaciones?: string | null
  idPrescripcion?: number | null
  labor?: LaborItem
}

export interface CampaniaInsumoDetalle {
  id: number
  idCampania: number
  idInsumo: number | null
  unidadesHa: number
  costoUnidad: number
  superficieAplicada: number
  idPrescripcion?: number | null
  insumo?: InsumoItem
}

export interface CampaniaCostoDetalle {
  id: number
  idCampania: number
  idCosto: number | null
  unidadesHa: number
  costoUnidad: number
  costo?: CostoItem
}

export interface Campania {
  id: number
  campania: string
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
 * Períodos válidos de campaña ("YY/YY"), precargados. Arranca en 25/26 y llega
 * hasta el período actual (año en curso / año siguiente). A partir del 1 de
 * enero de cada año se habilita el período del año en curso. Orden: más reciente
 * primero.
 */
export function periodosCampania(): string[] {
  const currentYear = new Date().getFullYear()
  const periods: string[] = []
  for (let y = 2025; y <= currentYear; y++) {
    periods.push(`${String(y % 100).padStart(2, '0')}/${String((y + 1) % 100).padStart(2, '0')}`)
  }
  return periods.reverse()
}

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
 * Costo ponderado por ha de un insumo individual.
 *  ponderado = (unidades/ha × costo/unidad × sup. aplicada) / sup. sembrada
 *  Misma lógica que el ponderado de labores. Si no hay sup. sembrada, 0.
 */
export function costoPonderadoInsumoRowHa(item: CampaniaInsumoDetalle, supSembrada: number): number {
  if (supSembrada <= 0) return 0
  return (num(item.unidadesHa) * num(item.costoUnidad) * num(item.superficieAplicada)) / supSembrada
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
 * Los costos de insumos se guardan en USD (el campo `costoUnidad` de
 * campania_insumo es USD). Para que los indicadores queden en pesos (como el
 * resto), `dolarInsumo` (dólar venta) convierte los totales de insumos.
 *
 * Todas las columnas $/lote se obtienen multiplicando el $/ha de su ítem por
 * la superficie sembrada.
 */
export function calcularResultados(
  c: Pick<Campania,
    'supSembrada' | 'supCosechada' | 'prodNetaTotalQq' | 'precioXQq' |
    'comercializacionPct' | 'cosechaXHa' | 'alquilerQqHa' |
    'labores' | 'insumos' | 'costos'
  >,
  dolarInsumo = 1,
): ResultadosCampania {
  const supSembrada = num(c.supSembrada)
  const supCosechada = num(c.supCosechada)
  const prodNeta = num(c.prodNetaTotalQq)
  const precio = num(c.precioXQq)
  const comercPct = num(c.comercializacionPct)
  const cosechaHa = num(c.cosechaXHa)
  const alquilerQqHa = num(c.alquilerQqHa)
  const dInsumo = num(dolarInsumo) || 1

  const rendimientoQqHa = supCosechada > 0 ? prodNeta / supCosechada : 0
  const ingresoNetoHa = rendimientoQqHa * precio * (1 - comercPct / 100)

  const costoTotalLaboresHa = (c.labores || []).reduce(
    (acc, l) => acc + costoPonderadoHa(l, supSembrada), 0
  )
  const costoTotalInsumosHa = (c.insumos || []).reduce(
    (acc, i) => acc + costoPonderadoInsumoRowHa(i, supSembrada), 0
  ) * dInsumo
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
    ingresoNetoLote: ingresoNetoHa * supSembrada,

    costoCosechaHa: cosechaHa,
    costoCosechaLote: cosechaHa * supSembrada,

    costoTotalLaboresHa,
    costoTotalLaboresLote: costoTotalLaboresHa * supSembrada,

    costoTotalInsumosHa,
    costoTotalInsumosLote: costoTotalInsumosHa * supSembrada,

    costoTotalCostosHa,
    costoTotalCostosLote: costoTotalCostosHa * supSembrada,

    totalCostosDirectosHa,
    totalCostosDirectosLote: totalCostosDirectosHa * supSembrada,

    costoAlquilerHa,
    costoAlquilerLote: costoAlquilerHa * supSembrada,

    margenBrutoSAlquilerHa,
    margenBrutoSAlquilerLote: margenBrutoSAlquilerHa * supSembrada,

    margenBrutoCAlquilerHa,
    margenBrutoCAlquilerLote: margenBrutoCAlquilerHa * supSembrada,
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

/**
 * Redondea un número a 2 decimales (half-up) preservando el signo.
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/**
 * Formato para un input numérico: "0" si el valor es 0, si no
 * "n.toFixed(2)". Sirve para mostrar valores a 2 decimales sin ceros
 * innecesarios en el caso 0.
 */
export function formatInputNumber(n: number | null | undefined): string {
  const v = round2(typeof n === 'number' ? n : 0)
  if (v === 0) return '0'
  return v.toFixed(2)
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
