import useSWR from 'swr'
import { Wheat } from 'lucide-react'
import { fetcher } from '../lib/api'

interface PrecioCereal {
  cultivo: string
  precioArs: number | null
  precioUsd: number | null
  estimado: boolean
  sinCotizacion: boolean
}

interface Pizarra {
  fechaPizarra: string | null
  precios: PrecioCereal[]
}

/** Orden canónico de cereales (la CAC a veces los devuelve en otro orden). */
const ORDEN = ['soja', 'maiz', 'trigo', 'girasol', 'sorgo']

const fmtTn = (n: number): string =>
  '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

const nombre = (c: string): string => c.charAt(0).toUpperCase() + c.slice(1)

/**
 * Pizarra CAC compacta para el header (a la izquierda del dólar).
 * El server cachea el scraping 6h, así que el polling horario no pega al sitio.
 */
export default function CotizacionesPizarra() {
  const { data } = useSWR<Pizarra>('/facturacion/precios', fetcher, {
    refreshInterval: 60 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 30 * 60 * 1000,
  })

  if (!data || !data.precios || data.precios.length === 0) return null

  const precios = [...data.precios].sort(
    (a, b) => ORDEN.indexOf(a.cultivo) - ORDEN.indexOf(b.cultivo),
  )

  return (
    <div className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-xs">
      <Wheat className="size-3.5 text-primary shrink-0" strokeWidth={2} />
      <span className="font-semibold uppercase tracking-wider text-muted-foreground">Pizarra</span>
      {precios.map((p) => (
        <span
          key={p.cultivo}
          className="tabular-nums whitespace-nowrap rounded px-1 py-0.5 text-muted-foreground"
          title={
            p.sinCotizacion
              ? `${nombre(p.cultivo)} sin cotización (se usa tarifa base)`
              : `${nombre(p.cultivo)} ${fmtTn(p.precioArs ?? 0)}/Tn` +
                (p.precioUsd ? ` · US$ ${p.precioUsd}/Tn` : '') +
                (p.estimado ? ' · estimado' : '') +
                (data.fechaPizarra ? ` · pizarra del ${data.fechaPizarra}` : '')
          }
        >
          {nombre(p.cultivo).slice(0, 3)}.{' '}
          {p.sinCotizacion || p.precioArs === null ? (
            <span className="font-medium">S/C</span>
          ) : (
            <span className="font-medium text-foreground">
              {fmtTn(p.precioArs)}
              {p.estimado && <span className="text-warning"> (E)</span>}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}
