import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import {
  Loader2, ArrowLeft, AlertCircle, ClipboardList, Sprout, MapPin,
  LandPlot,
} from 'lucide-react'
import api, { esErrorDeAcceso } from '../lib/api'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { useAuth } from '../contexts/auth-context'
import { periodosCampania } from '../lib/campanias'
import {
  getProducciones, crearReporte, actualizarReporte,
  fmtPesos, mensajeError, TIPO_COSECHA_LABEL,
  type ProduccionesReporte, type ProduccionCandidata, type DetalleFila, type DetalleTotales, type TipoCosecha,
} from '../lib/reportes'

interface FilaDetalle {
  idLote: number | ''
  idProduccion: number | ''
  porcentaje: number
  incluido: boolean
}

interface DetalleSavedFila {
  idLote: number
  idProduccion: number | null
  porcentajeAsesoramiento: number
}

/**
 * Arma las filas automáticas: un set campo+lote por cada lote que tenga al
 * menos una producción del tipo de cosecha elegido. En creación todos quedan
 * incluidos; en edición sólo los que tiene el reporte guardado.
 */
function buildFilasDetalle(
  prods: ProduccionesReporte,
  tipo: TipoCosecha,
  pctGeneral: number,
  saved?: DetalleSavedFila[],
): FilaDetalle[] {
  const porLote = new Map<number, ProduccionCandidata[]>()
  for (const p of prods.producciones) {
    if (p.tipoCosecha !== tipo) continue
    if (!porLote.has(p.idLote)) porLote.set(p.idLote, [])
    porLote.get(p.idLote)!.push(p)
  }
  const incluidos = new Set((saved || []).map((s) => s.idLote))
  return prods.lotes
    .filter((l) => porLote.has(l.id))
    .map((l): FilaDetalle | null => {
      const ops = (porLote.get(l.id) || []).sort((a, b) =>
        a.cultivoNombre.localeCompare(b.cultivoNombre, 'es'),
      )
      const savedRow = saved?.find((s) => s.idLote === l.id)
      return {
        idLote: l.id,
        idProduccion:
          savedRow?.idProduccion != null && ops.some((p) => p.id === savedRow.idProduccion)
            ? savedRow.idProduccion
            : ops.length === 1
              ? ops[0].id
              : '',
        porcentaje: savedRow?.porcentajeAsesoramiento ?? pctGeneral,
        incluido: saved ? incluidos.has(l.id) : true,
      }
    })
    .filter((x): x is FilaDetalle => x !== null)
}

const inputCls =
  'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const labelCls = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1'

const decimalAPct = (v: number): string => String(Math.round(v * 10000) / 100)
const pctADecimal = (v: string): number => (parseFloat(v) || 0) / 100

export default function ReporteDetalle() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const { permisos, empresas } = useAuth()
  const canRead = permisos.includes('lectura:reporte')
  const canWrite = permisos.includes('escritura:reporte')

  const [empresaId, setEmpresaId] = useState<number | ''>('')
  const [campania, setCampania] = useState(() => periodosCampania()[0] || '')
  const [tipoCosecha, setTipoCosecha] = useState<TipoCosecha | ''>('')
  const [generalPct, setGeneralPct] = useState('1.5')
  const generalRef = useRef(pctADecimal(generalPct))
  const [aplicaIva, setAplicaIva] = useState(false)
  const [filas, setFilas] = useState<FilaDetalle[]>([])
  const [editFilas, setEditFilas] = useState<DetalleSavedFila[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cargandoEdit, setCargandoEdit] = useState(false)
  const autoBuildRef = useRef<string | null>(null)

  const { data: producciones, isLoading: loadingProducciones } = useSWR<ProduccionesReporte>(
    empresaId !== '' ? ['reportes/producciones', empresaId, campania] : null,
    () => getProducciones(Number(empresaId), campania),
  )

  useEffect(() => {
    if (!editId) return
    let cancelled = false
    setCargandoEdit(true)
    api
      .get(`/reportes/${editId}`)
      .then((r) => {
        if (cancelled) return
        const d = r.data as {
          idEmpresa: number
          campania: string
          tipoCosecha: TipoCosecha | null
          asesoramientoPorcentaje: number | null
          aplicaIva: boolean
          filas: DetalleSavedFila[]
        }
        setEmpresaId(d.idEmpresa)
        setCampania(d.campania)
        setTipoCosecha(d.tipoCosecha || '')
        setGeneralPct(decimalAPct(d.asesoramientoPorcentaje ?? 0.015))
        generalRef.current = d.asesoramientoPorcentaje ?? 0.015
        setAplicaIva(d.aplicaIva)
        setEditFilas(d.filas)
      })
      .catch((e) => {
        if (cancelled) return
        // Sin permiso sobre la empresa (403), inexistente (404) o sin sesión
        // (401): volver al listado.
        if (esErrorDeAcceso(e)) {
          navigate('/reportes', { replace: true })
          return
        }
        setError(mensajeError(e, 'No se pudo cargar el reporte.'))
      })
      .finally(() => !cancelled && setCargandoEdit(false))
    return () => { cancelled = true }
  }, [editId, navigate])

  // Auto-agregar todos los sets campo+lote al elegir productor + campaña +
  // tipo de cosecha (o al cargar la edición). Una vez por combinación.
  useEffect(() => {
    if (empresaId === '' || tipoCosecha === '' || !producciones) return
    const key = `${empresaId}|${campania}|${tipoCosecha}|${editId ?? ''}|${editFilas?.length ?? -1}`
    if (autoBuildRef.current === key) return
    autoBuildRef.current = key
    setFilas(buildFilasDetalle(producciones, tipoCosecha, generalRef.current, editFilas ?? undefined))
  }, [producciones, empresaId, campania, tipoCosecha, editFilas, editId])

  const produccionesDeLote = (loteId: number | '') =>
    loteId === '' || !producciones || tipoCosecha === ''
      ? []
      : producciones.producciones.filter((p) => p.idLote === Number(loteId) && p.tipoCosecha === tipoCosecha)

  const updateFila = (idx: number, patch: Partial<FilaDetalle>) => {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }

  const toggleFila = (idx: number) => {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, incluido: !f.incluido } : f)))
  }

  const handleGeneralChange = (value: string) => {
    const next = pctADecimal(value)
    setGeneralPct(value)
    setFilas((prev) =>
      prev.map((f) => (f.porcentaje === generalRef.current ? { ...f, porcentaje: next } : f)),
    )
    generalRef.current = next
  }

  const derivado = useMemo<{ filas: DetalleFila[]; totales: DetalleTotales } | null>(() => {
    if (!producciones) return null
    const filasCalc: DetalleFila[] = filas
      .filter((f) => f.incluido)
      .map((f) => {
        const prod = producciones.producciones.find((p) => p.id === f.idProduccion)
        const lote = producciones.lotes.find((l) => l.id === Number(f.idLote))
        const produccionQq = prod ? prod.produccionQq : null
        const precioQq = prod ? prod.precioXQq : null
        const total = produccionQq != null && precioQq != null ? produccionQq * precioQq * f.porcentaje : null
        return {
          id: null,
          idLote: f.idLote === '' ? 0 : Number(f.idLote),
          loteNombre: lote?.descripcion || prod?.loteDescripcion || `Lote #${f.idLote || '—'}`,
          campoNombre: lote?.campoNombre ?? prod?.campoNombre ?? null,
          idProduccion: f.idProduccion === '' ? null : f.idProduccion,
          cultivoNombre: prod?.cultivoNombre ?? '—',
          produccionQq,
          precioQq,
          porcentajeAsesoramiento: f.porcentaje,
          totalAsesoramiento: total,
        }
      })

    let totalSinIva = 0
    for (const r of filasCalc) {
      if (r.totalAsesoramiento != null) totalSinIva += r.totalAsesoramiento
    }
    const iva = aplicaIva ? totalSinIva * 0.21 : 0

    return {
      filas: filasCalc,
      totales: {
        totalSinIva,
        iva,
        totalConIva: totalSinIva + iva,
        aplicaIva,
      },
    }
  }, [filas, producciones, aplicaIva])

  const check = (): { ok: boolean; error?: string } => {
    if (empresaId === '') return { ok: false, error: 'Seleccioná un productor.' }
    if (tipoCosecha === '') return { ok: false, error: 'Seleccioná el tipo de cosecha.' }
    if (filas.length === 0) return { ok: false, error: 'No hay producciones para el productor, campaña y tipo seleccionados.' }
    const incluidas = filas.filter((f) => f.incluido)
    if (incluidas.length === 0) return { ok: false, error: 'Incluí al menos un lote en el reporte.' }
    for (const f of incluidas) {
      if (f.idLote === '') return { ok: false, error: 'Cada fila debe tener un lote.' }
      if (f.idProduccion === '') return { ok: false, error: 'Cada lote incluido debe tener una producción.' }
    }
    return { ok: true }
  }

  const buildPayload = () => ({
    idEmpresa: Number(empresaId),
    campania,
    tipo: 'detalle_asesoramiento' as const,
    tipoCosecha: tipoCosecha as TipoCosecha,
    asesoramientoPorcentaje: generalRef.current,
    aplicaIva,
    filas: filas
      .filter((f) => f.incluido)
      .map((f) => ({
        idLote: Number(f.idLote),
        idProduccion: Number(f.idProduccion),
        porcentajeAsesoramiento: f.porcentaje,
      })),
  })

  const handleGuardar = async () => {
    const c = check()
    if (!c.ok) { setError(c.error || ''); return }
    setError(null)
    setSaving(true)
    try {
      if (editId) {
        await actualizarReporte(editId, buildPayload())
      } else {
        await crearReporte(buildPayload())
      }
      navigate('/reportes')
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar el reporte.'))
    } finally {
      setSaving(false)
    }
  }

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tienes permisos para ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/reportes')}
            className="p-2 cursor-pointer rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Volver"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Detalle asesoramiento</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {editId ? `Editando reporte #${editId}` : 'Nuevo reporte de asesoramiento por cultivo'}
            </p>
          </div>
        </div>
      </div>

      {cargandoEdit ? (
        <div className="flex flex-col items-center justify-center p-16 bg-card rounded-lg border border-border">
          <Loader2 className="size-8 text-primary mb-3 animate-spin" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando reporte...</p>
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Productor</label>
                <SelectAutocomplete
                  value={empresaId}
                  onChange={(v) => { setEmpresaId(v === '' ? '' : Number(v)); setFilas([]) }}
                  placeholder="Seleccionar productor..."
                  options={[{ value: '', label: 'Seleccionar productor...' }, ...empresas.map((e) => ({ value: e.id, label: e.nombre }))]}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Campaña</label>
                <SelectAutocomplete
                  value={campania}
                  onChange={(v) => { setCampania(String(v)); setFilas([]) }}
                  options={periodosCampania().map((p) => ({ value: p, label: p }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Tipo de cosecha</label>
                <SelectAutocomplete
                  value={tipoCosecha}
                  onChange={(v) => { setTipoCosecha(v as TipoCosecha | ''); setFilas([]) }}
                  options={[
                    { value: '', label: 'Seleccionar...' },
                    ...(Object.keys(TIPO_COSECHA_LABEL) as TipoCosecha[]).map((t) => ({ value: t, label: TIPO_COSECHA_LABEL[t] })),
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">% asesoramiento general</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={generalPct}
                    onChange={(e) => handleGeneralChange(e.target.value)}
                    className={inputCls + ' pr-8'}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAplicaIva((v) => !v)}
                role="switch"
                aria-checked={aplicaIva}
                className={`relative inline-flex cursor-pointer items-center h-6 w-11 rounded-full transition-colors ${aplicaIva ? 'bg-primary' : 'bg-muted border border-border'}`}
              >
                <span className={`inline-block size-4 rounded-full bg-white shadow transform transition-transform ${aplicaIva ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm text-foreground">Aplicar IVA (21%)</span>
            </div>

            <div className="space-y-2">
              {filas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {loadingProducciones
                    ? 'Cargando producciones del productor...'
                    : 'Seleccioná productor, campaña y tipo de cosecha para cargar los lotes.'}
                </p>
              ) : (
                filas.map((f, idx) => {
                  const lote = producciones?.lotes.find((l) => l.id === Number(f.idLote))
                  const excluido = !f.incluido
                  return (
                    <div
                      key={f.idLote}
                      className={`rounded-md p-3 space-y-2 transition-colors border ${excluido
                        ? 'border-destructive/30 bg-muted/30 opacity-60'
                        : 'border-border bg-muted/30'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-sm min-w-0">
                          <div className="flex gap-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                              <MapPin className="size-4 shrink-0" strokeWidth={2} />
                              Campo
                            </p>
                            <span className="font-medium text-foreground truncate">{lote?.campoNombre || '—'}</span>
                          </div>
                          <span className="text-muted-foreground shrink-0">·</span>
                          <div className="flex gap-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                              <LandPlot className="size-4 shrink-0" strokeWidth={2} />
                              Lote
                            </p>
                            <span className="text-foreground truncate">{lote?.descripcion || `Lote #${f.idLote}`}</span>
                          </div>
                          {excluido && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-destructive-soft text-destructive text-[10px] font-semibold uppercase tracking-wider rounded">
                              No incluido
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] font-medium ${excluido ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {excluido ? 'No incluido' : 'Incluido'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleFila(idx)}
                            role="switch"
                            aria-checked={f.incluido}
                            className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors cursor-pointer ${f.incluido ? 'bg-primary' : 'bg-muted border border-border'}`}
                          >
                            <span className={`inline-block size-4 rounded-full bg-white shadow transform transition-transform ${f.incluido ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className={labelCls}><Sprout className="size-3" strokeWidth={2} /> Producción</label>
                          <SelectAutocomplete
                            disabled={excluido}
                            value={f.idProduccion}
                            onChange={(v) => updateFila(idx, { idProduccion: v === '' ? '' : Number(v) })}
                            options={[
                              { value: '', label: 'Seleccionar producción...' },
                              ...produccionesDeLote(f.idLote).map((p) => ({ value: p.id, label: p.cultivoNombre })),
                            ]}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className={labelCls}>% asesoramiento</label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              disabled={excluido}
                              value={decimalAPct(f.porcentaje)}
                              onChange={(e) => updateFila(idx, { porcentaje: pctADecimal(e.target.value) })}
                              className={inputCls + ' pr-8 disabled:opacity-50 disabled:cursor-not-allowed'}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {error && (
              <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                <AlertCircle className="size-3" strokeWidth={1.75} />
                {error}
              </p>
            )}

            {canWrite && (
              <div className="pt-1">
                <button
                  onClick={handleGuardar}
                  disabled={saving}
                  className="inline-flex cursor-pointer items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  <ClipboardList className="size-4" strokeWidth={1.75} />
                  {editId ? 'Guardar cambios' : 'Guardar reporte'}
                </button>
              </div>
            )}
          </div>

          {/* Resultado */}
          {derivado && derivado.filas.length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  DETALLE ASESORAMIENTO {tipoCosecha === 'fina' ? 'FINA' : 'GRUESA'} {campania} ·{' '}
                  {empresas.find((e) => e.id === Number(empresaId))?.nombre}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campo</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lote</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cultivo</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Producción (QQ)</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Precio ($/QQ)</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">% Asesoramiento</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Total asesoramiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {derivado.filas.map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 text-foreground">{r.campoNombre || '—'}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{r.loteNombre}</td>
                        <td className="px-4 py-3 text-foreground">{r.cultivoNombre}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.produccionQq != null ? r.produccionQq : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtPesos(r.precioQq)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{decimalAPct(r.porcentajeAsesoramiento)}%</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtPesos(r.totalAsesoramiento)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total s/ IVA</span>
                  <span className="tabular-nums">{fmtPesos(derivado.totales.totalSinIva)}</span>
                </div>
                {derivado.totales.aplicaIva && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IVA (21%)</span>
                      <span className="tabular-nums">{fmtPesos(derivado.totales.iva)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span className="text-foreground">Total c/ IVA</span>
                      <span className="tabular-nums">{fmtPesos(derivado.totales.totalConIva)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
