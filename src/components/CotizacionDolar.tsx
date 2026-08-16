import useSWR from 'swr'
import { DollarSign } from 'lucide-react'
import api from '../lib/api'
import { useMonedaGlobal } from '../lib/monedaStore'

interface DolarData {
  casa: string
  compra: number
  venta: number
  fechaActualizacion: string
  actualizadoEn: string
}

const fmt = (n: number) =>
  '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Rate({
  active,
  tipo,
  label,
  valor,
}: {
  active: boolean
  tipo: 'compra' | 'venta'
  label: string
  valor: number
}) {
  return (
    <span
      className={`tabular-nums rounded px-1 py-0.5 ${
        active ? 'bg-primary/15 text-primary font-bold ring-1 ring-primary/50' : 'text-muted-foreground'
      }`}
      title={active ? `Dólar ${tipo} en uso` : undefined}
    >
      {label} <span className={active ? 'font-bold text-primary' : 'font-medium text-foreground'}>{fmt(valor)}</span>
    </span>
  )
}

export default function CotizacionDolar() {
  const { data } = useSWR<DolarData>(
    '/cotizaciones/dolar-bna',
    (url) => api.get(url).then((r) => r.data),
    { refreshInterval: 30 * 60 * 1000, revalidateOnFocus: false }
  )
  const { moneda, tipoDolar, base } = useMonedaGlobal()

  if (!data || (!data.compra && !data.venta)) return null

  const resaltar = (tipo: 'compra' | 'venta') => moneda !== base && tipoDolar === tipo

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-md text-xs">
      <DollarSign className="size-3.5 text-success" strokeWidth={2} />
      <span className="font-semibold uppercase tracking-wider text-muted-foreground">Dólar BNA</span>
      <Rate active={resaltar('compra')} tipo="compra" label="C" valor={data.compra} />
      <Rate active={resaltar('venta')} tipo="venta" label="V" valor={data.venta} />
    </div>
  )
}
