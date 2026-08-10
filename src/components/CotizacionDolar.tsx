import useSWR from 'swr'
import { DollarSign } from 'lucide-react'
import api from '../lib/api'

interface DolarData {
  casa: string
  compra: number
  venta: number
  fechaActualizacion: string
  actualizadoEn: string
}

const fmt = (n: number) =>
  '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CotizacionDolar() {
  const { data } = useSWR<DolarData>(
    '/cotizaciones/dolar-bna',
    (url) => api.get(url).then((r) => r.data),
    { refreshInterval: 30 * 60 * 1000, revalidateOnFocus: false }
  )

  if (!data || (!data.compra && !data.venta)) return null

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-md text-xs">
      <DollarSign className="size-3.5 text-success" strokeWidth={2} />
      <span className="font-semibold uppercase tracking-wider text-muted-foreground">Dólar BNA</span>
      <span className="tabular-nums text-muted-foreground">
        C <span className="font-medium text-foreground">{fmt(data.compra)}</span>
      </span>
      <span className="tabular-nums text-muted-foreground">
        V <span className="font-medium text-foreground">{fmt(data.venta)}</span>
      </span>
    </div>
  )
}
