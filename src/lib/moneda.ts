import useSWR from 'swr'
import api from './api'

export type Moneda = 'pesos' | 'usd'

interface Cotizacion {
  compra: number
  venta: number
}

const fetcher = (url: string) => api.get(url).then((r) => r.data)

/**
 * Cotización del dólar (cacheada en el backend con TTL y revalidada acá).
 */
export function useCotizacionDolar() {
  const { data } = useSWR<Cotizacion>('/cotizaciones/dolar-bna', fetcher, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
  })
  return {
    compra: data?.compra ?? 0,
    venta: data?.venta ?? 0,
  }
}

const fmtNum = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Formatea un precio cuyo valor guardado es en pesos (costos, labores).
 * En USD se divide por la cotización indicada (compra o venta según la vista).
 */
export function fmtPrecio(valor: number | null | undefined, moneda: Moneda, dolar: number): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  const v = Number(valor)
  if (moneda === 'usd') {
    const d = dolar > 0 ? dolar : 1
    return `USD ${fmtNum(v / d)}`
  }
  return `$${fmtNum(v)}`
}

/**
 * Formatea el precio de un insumo. El valor guardado en BD es en dólares;
 * en pesos se multiplica por la cotización de venta. La conversión es visual.
 */
export function fmtPrecioInsumo(valor: number | null | undefined, moneda: Moneda, dolar: number): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  const v = Number(valor)
  if (moneda === 'pesos') {
    const d = dolar > 0 ? dolar : 1
    return `$${fmtNum(v * d)}`
  }
  return `USD ${fmtNum(v)}`
}
