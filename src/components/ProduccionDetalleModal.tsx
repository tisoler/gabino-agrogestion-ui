import useSWR from 'swr'
import { X, Loader2, AlertCircle, MapPin, Layers, Pickaxe, Package, DollarSign } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { useCotizacionDolar, fmtPrecioInsumo } from '../lib/moneda'
import {
  calcularResultados, costoTotalCostoRowHa, costoPonderadoHa, costoPonderadoInsumoRowHa,
  fmtNumero, fmtMoneda, fmtQQHa,
  type Campania, type CampaniaInsumoDetalle, type CampaniaLaborDetalle, type CampaniaCostoDetalle,
} from '../lib/campanias'
import { fmtFecha } from '../lib/prescripciones'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

const labelCls = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'
const valueCls = 'text-sm text-foreground'

interface ProduccionDetalleModalProps {
  campaniaId: number
  onClose: () => void
}

export default function ProduccionDetalleModal({ campaniaId, onClose }: ProduccionDetalleModalProps) {
  const { empresas } = useAuth()
  const { venta: dolarVenta } = useCotizacionDolar()
  const { data: campania, error, isLoading } = useSWR<Campania>(
    `/campanias/${campaniaId}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  const supSembrada = campania?.supSembrada != null ? Number(campania.supSembrada) : 0
  const resultados = campania
    ? calcularResultados({
      supSembrada: Number(campania.supSembrada) || 0,
      supCosechada: Number(campania.supCosechada) || 0,
      prodNetaTotalQq: Number(campania.prodNetaTotalQq) || 0,
      precioXQq: Number(campania.precioXQq) || 0,
      comercializacionPct: Number(campania.comercializacionPct) || 0,
      cosechaXHa: Number(campania.cosechaXHa) || 0,
      alquilerQqHa: Number(campania.alquilerQqHa) || 0,
      labores: campania.labores || [],
      insumos: campania.insumos || [],
      costos: campania.costos || [],
    }, dolarVenta && dolarVenta > 0 ? dolarVenta : 1)
    : null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-card border border-border rounded-lg shadow-xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border flex justify-between items-center gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Producción</h2>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {campania ? (
                <>
                  {empresas.find((e) => e.id === campania.lote?.idEmpresa)?.nombre || `Productor #${campania.lote?.idEmpresa ?? '—'}`}
                  {' · '}
                  {campania.lote?.campo?.nombre || 'Sin campo'}
                  {' · '}
                  {campania.lote?.descripcion || `Lote #${campania.lote?.id ?? '—'}`}
                </>
              ) : (
                'Cargando…'
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="size-6 text-primary mb-3 animate-spin" strokeWidth={1.75} />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando producción...</p>
            </div>
          ) : error || !campania ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="size-8 text-destructive mb-3" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No se pudo cargar la producción o no tenés acceso.</p>
            </div>
          ) : (
            <>
              {/* Datos de la producción */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary" strokeWidth={1.75} />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Datos de la producción</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  <CampoValor label="Campaña" value={campania.campania || '—'} />
                  <CampoValor label="Productor" value={empresas.find((e) => e.id === campania.lote?.idEmpresa)?.nombre || `Productor #${campania.lote?.idEmpresa ?? '—'}`} />
                  <CampoValor label="Campo" value={campania.lote?.campo?.nombre || '—'} />
                  <CampoValor label="Lote" value={campania.lote?.descripcion || `Lote #${campania.lote?.id ?? '—'}`} />
                  <CampoValor label="Cultivo" value={campania.cultivo?.nombre || '—'} />
                  <CampoValor label="Variedad" value={campania.variedad?.nombre || '—'} />
                  <CampoValor label="Sup. sembrada (ha)" value={fmtNumero(campania.supSembrada, 2)} />
                  <CampoValor label="Sup. cosechada (ha)" value={fmtNumero(campania.supCosechada, 2)} />
                  <CampoValor label="Produc. neta total (qq)" value={fmtNumero(campania.prodNetaTotalQq, 2)} />
                  <CampoValor label="Precio ($/qq)" value={fmtMoneda(campania.precioXQq, 2)} />
                  <CampoValor label="Alquiler (qq/ha)" value={fmtNumero(campania.alquilerQqHa, 2)} />
                  <CampoValor label="Comercialización (%)" value={campania.comercializacionPct != null ? `${fmtNumero(campania.comercializacionPct, 2)} %` : '—'} />
                  <CampoValor label="Cosecha ($/ha)" value={fmtMoneda(campania.cosechaXHa, 2)} />
                  <CampoValor label="Rendimiento" value={fmtQQHa(resultados?.rendimientoQqHa, 2)} />
                </div>
              </section>

              {/* Labores */}
              {campania.labores && campania.labores.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Pickaxe className="size-4 text-primary" strokeWidth={1.75} />
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Labores</h3>
                  </div>
                  <Tabla>
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <Th>Labor</Th>
                        <Th>Fecha</Th>
                        <Th right>Sup. laboreada</Th>
                        <Th right>Costo labor/ha</Th>
                        <Th right>Costo ponderado/ha</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {campania.labores.map((l) => (
                        <Fila key={l.id}>
                          <Td>{l.labor?.nombre || `Labor #${l.idLabor}`}</Td>
                          <Td>{fmtFecha(l.fecha)}</Td>
                          <Td right>{fmtNumero(l.superficieLaboreada, 2)}</Td>
                          <Td right>{fmtMoneda(l.costoLaborHa, 2)}</Td>
                          <Td right>{fmtMoneda(costoPonderadoHa(l as CampaniaLaborDetalle, supSembrada), 2)}</Td>
                        </Fila>
                      ))}
                    </tbody>
                  </Tabla>
                </section>
              )}

              {/* Insumos */}
              {campania.insumos && campania.insumos.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="size-4 text-primary" strokeWidth={1.75} />
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Insumos</h3>
                  </div>
                  <Tabla>
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <Th>Insumo</Th>
                        <Th right>Sup. aplicada</Th>
                        <Th right>Unidades/ha</Th>
                        <Th right>Costo/unidad</Th>
                        <Th right>Costo ponderado/ha</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {campania.insumos.map((i) => (
                        <Fila key={i.id}>
                          <Td>{i.insumo?.nombre || `Insumo #${i.idInsumo}`}</Td>
                          <Td right>{fmtNumero(i.superficieAplicada, 2)}</Td>
                          <Td right>{fmtNumero(i.unidadesHa, 3)}</Td>
                          <Td right>{fmtPrecioInsumo(i.costoUnidad, 'pesos', dolarVenta)}</Td>
                          <Td right>{fmtPrecioInsumo(costoPonderadoInsumoRowHa(i as CampaniaInsumoDetalle, supSembrada), 'pesos', dolarVenta)}</Td>
                        </Fila>
                      ))}
                    </tbody>
                  </Tabla>
                </section>
              )}

              {/* Costos varios */}
              {campania.costos && campania.costos.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="size-4 text-primary" strokeWidth={1.75} />
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Costos varios</h3>
                  </div>
                  <Tabla>
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <Th>Costo</Th>
                        <Th right>Unidades/ha</Th>
                        <Th right>Costo/unidad</Th>
                        <Th right>Costo total</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {campania.costos.map((k) => (
                        <Fila key={k.id}>
                          <Td>{k.costo?.nombre || `Costo #${k.idCosto}`}</Td>
                          <Td right>{fmtNumero(k.unidadesHa, 2)}</Td>
                          <Td right>{fmtMoneda(k.costoUnidad, 2)}</Td>
                          <Td right>{fmtMoneda(costoTotalCostoRowHa(k as CampaniaCostoDetalle), 2)}</Td>
                        </Fila>
                      ))}
                    </tbody>
                  </Tabla>
                </section>
              )}

              {/* Resultados económicos */}
              {resultados && (
                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-primary" strokeWidth={1.75} />
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Resultados económicos</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/20">
                          <Th>Concepto</Th>
                          <Th right>$/ha</Th>
                          <Th right>$/lote</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <ResultRow label="Ingreso neto" ha={resultados.ingresoNetoHa} lote={resultados.ingresoNetoLote} positive />
                        <ResultRow label="Costo cosecha" ha={resultados.costoCosechaHa} lote={resultados.costoCosechaLote} subtract />
                        <ResultRow label="Costo labores" ha={resultados.costoTotalLaboresHa} lote={resultados.costoTotalLaboresLote} subtract />
                        <ResultRow label="Costo insumos" ha={resultados.costoTotalInsumosHa} lote={resultados.costoTotalInsumosLote} subtract />
                        <ResultRow label="Costos varios" ha={resultados.costoTotalCostosHa} lote={resultados.costoTotalCostosLote} subtract />
                        <ResultRow label="Total de costos directos" ha={resultados.totalCostosDirectosHa} lote={resultados.totalCostosDirectosLote} bold />
                        <ResultRow label="Margen bruto s/ alquiler" ha={resultados.margenBrutoSAlquilerHa} lote={resultados.margenBrutoSAlquilerLote} positive bold />
                        <ResultRow label="Costo de alquiler" ha={resultados.costoAlquilerHa} lote={resultados.costoAlquilerLote} subtract />
                        <ResultRow label="Margen bruto c/ alquiler" ha={resultados.margenBrutoCAlquilerHa} lote={resultados.margenBrutoCAlquilerLote} positive bold />
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border bg-muted/30 shrink-0">
          <p className="text-[11px] text-muted-foreground">Vista de solo lectura.</p>
        </div>
      </div>
    </div>
  )
}

function CampoValor({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className={labelCls}>{label}</p>
      <p className={valueCls + ' truncate'}>{value}</p>
    </div>
  )
}

function Tabla({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto border border-border rounded-md">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 ${labelCls} ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <td className={`px-4 py-2.5 ${right ? 'text-right tabular-nums' : 'text-left'}`}>
      {children}
    </td>
  )
}

function Fila({ children }: { children: React.ReactNode }) {
  return <tr>{children}</tr>
}

function ResultRow({
  label, ha, lote, bold, subtract, positive,
}: { label: string; ha: number; lote: number; bold?: boolean; subtract?: boolean; positive?: boolean }) {
  const fmtVal = (v: number) => {
    if (v < 0) return `−${fmtMoneda(Math.abs(v), 2)}`
    if (subtract) return `−${fmtMoneda(v, 2)}`
    return fmtMoneda(v, 2)
  }
  const negative = ha < 0 || lote < 0
  const tone = negative
    ? 'text-destructive'
    : positive
      ? 'text-success'
      : subtract
        ? 'text-muted-foreground'
        : 'text-foreground'
  return (
    <tr className={bold ? 'bg-muted/10' : ''}>
      <td className={`px-4 py-2 ${bold ? 'font-semibold' : 'text-foreground'}`}>{label}</td>
      <td className={`px-4 py-2 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${tone}`}>{fmtVal(ha)}</td>
      <td className={`px-4 py-2 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${tone}`}>{fmtVal(lote)}</td>
    </tr>
  )
}