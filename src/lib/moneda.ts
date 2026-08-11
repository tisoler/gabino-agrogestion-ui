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

/**
 * Formatea un precio según la moneda elegida. En USD se divide por la
 * cotización indicada (compra o venta según la vista). El valor guardado
 * siempre es en pesos; la conversión es sólo visual.
 */
export function fmtPrecio(valor: number | null | undefined, moneda: Moneda, dolar: number): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  const v = Number(valor)
  if (moneda === 'usd') {
    const d = dolar > 0 ? dolar : 1
    return `USD ${(v / d).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `$${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
