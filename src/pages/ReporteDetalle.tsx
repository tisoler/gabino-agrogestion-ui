import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import {
  Plus, Trash2, Loader2, ArrowLeft, AlertCircle, ClipboardList, MapPin, Sprout,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { periodosCampania } from '../lib/campanias'
import {
  getProducciones, crearReporte, actualizarReporte,
  fmtPesos, mensajeError, TIPO_COSECHA_LABEL,
  type ProduccionesReporte, type DetalleFila, type DetalleTotales, type TipoCosecha,
} from '../lib/reportes'

interface FilaDetalle {
  idLote: number | ''
  idProduccion: number | ''
  porcentaje: number
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cargandoEdit, setCargandoEdit] = useState(false)

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
          filas: DetalleFila[]
        }
        setEmpresaId(d.idEmpresa)
        setCampania(d.campania)
        setTipoCosecha(d.tipoCosecha || '')
        setGeneralPct(decimalAPct(d.asesoramientoPorcentaje ?? 0.015))
        generalRef.current = d.asesoramientoPorcentaje ?? 0.015
        setAplicaIva(d.aplicaIva)
        setFilas(
          d.filas.map((f) => ({
            idLote: f.idLote,
            idProduccion: f.idProduccion ?? '',
            porcentaje: f.porcentajeAsesoramiento,
          })),
        )
      })
      .catch((e) => setError(mensajeError(e, 'No se pudo cargar el reporte.')))
      .finally(() => !cancelled && setCargandoEdit(false))
    return () => { cancelled = true }
  }, [editId])

  const produccionesDeLote = (loteId: number | '') =>
    loteId === '' || !producciones || tipoCosecha === ''
      ? []
      : producciones.producciones.filter((p) => p.idLote === Number(loteId) && p.tipoCosecha === tipoCosecha)

  const addFila = () => {
    setFilas((prev) => [...prev, { idLote: '', idProduccion: '', porcentaje: generalRef.current }])
  }

  const updateFila = (idx: number, patch: Partial<FilaDetalle>) => {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }

  const removeFila = (idx: number) => {
    setFilas((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleLoteChange = (idx: number, value: number | '') => {
    const opciones = produccionesDeLote(value)
    updateFila(idx, { idLote: value, idProduccion: opciones.length === 1 ? opciones[0].id : '' })
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
    const filasCalc: DetalleFila[] = filas.map((f) => {
      const prod = producciones.producciones.find((p) => p.id === f.idProduccion)
      const produccionQq = prod ? prod.produccionQq : null
      const precioQq = prod ? prod.precioXQq : null
      const total = produccionQq != null && precioQq != null ? produccionQq * precioQq * f.porcentaje : null
      return {
        id: null,
        idLote: f.idLote === '' ? 0 : Number(f.idLote),
        loteNombre: prod?.loteDescripcion ?? `Lote #${f.idLote || '—'}`,
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
    if (filas.length === 0) return { ok: false, error: 'Agregá al menos un lote.' }
    for (const f of filas) {
      if (f.idLote === '') return { ok: false, error: 'Cada fila debe tener un lote.' }
      if (f.idProduccion === '') return { ok: false, error: 'Cada lote debe tener una producción.' }
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
    filas: filas.map((f) => ({
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
            className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
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
                <select
                  value={empresaId}
                  onChange={(e) => { setEmpresaId(e.target.value === '' ? '' : Number(e.target.value)); setFilas([]) }}
                  className={inputCls}
                >
                  <option value="">Seleccionar productor...</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Campaña</label>
                <select
                  value={campania}
                  onChange={(e) => { setCampania(e.target.value); setFilas([]) }}
                  className={inputCls}
                >
                  {periodosCampania().map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Tipo de cosecha</label>
                <select
                  value={tipoCosecha}
                  onChange={(e) => { setTipoCosecha(e.target.value as TipoCosecha | ''); setFilas([]) }}
                  className={inputCls}
                >
                  <option value="">Seleccionar...</option>
                  {(Object.keys(TIPO_COSECHA_LABEL) as TipoCosecha[]).map((t) => (
                    <option key={t} value={t}>{TIPO_COSECHA_LABEL[t]}</option>
                  ))}
                </select>
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
                className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${aplicaIva ? 'bg-primary' : 'bg-muted border border-border'}`}
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
                    : 'Agregá un lote para elegir su producción.'}
                </p>
              ) : (
                filas.map((f, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end bg-muted/30 border border-border rounded-md p-2">
                    <div className="space-y-1">
                      <label className={labelCls}><MapPin className="size-3" strokeWidth={2} /> Lote</label>
                      <select
                        value={f.idLote}
                        onChange={(e) => handleLoteChange(idx, e.target.value === '' ? '' : Number(e.target.value))}
                        className={inputCls}
                      >
                        <option value="">Seleccionar lote...</option>
                        {(producciones?.lotes || []).map((l) => (
                          <option key={l.id} value={l.id}>{l.descripcion || `Lote #${l.id}`}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}><Sprout className="size-3" strokeWidth={2} /> Producción</label>
                      <select
                        value={f.idProduccion}
                        onChange={(e) => updateFila(idx, { idProduccion: e.target.value === '' ? '' : Number(e.target.value) })}
                        className={inputCls}
                      >
                        <option value="">Seleccionar producción...</option>
                        {produccionesDeLote(f.idLote).map((p) => (
                          <option key={p.id} value={p.id}>{p.cultivoNombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>% asesoramiento</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={decimalAPct(f.porcentaje)}
                            onChange={(e) => updateFila(idx, { porcentaje: pctADecimal(e.target.value) })}
                            className={inputCls + ' pr-8'}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                        <button
                          onClick={() => removeFila(idx)}
                          className="p-2 rounded-md text-destructive hover:bg-destructive-soft transition-colors shrink-0"
                          aria-label="Quitar lote"
                          title="Quitar lote"
                        >
                          <Trash2 className="size-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={addFila}
              disabled={empresaId === '' || tipoCosecha === '' || loadingProducciones}
              className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
              Agregar lote
            </button>

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
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
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
