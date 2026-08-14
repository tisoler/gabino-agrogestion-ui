import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import {
  Plus, Trash2, Loader2, ArrowLeft, AlertCircle, FileBarChart, MapPin, Sprout,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { periodosCampania } from '../lib/campanias'
import {
  getProducciones, crearReporte, actualizarReporte,
  fmtPesos, mensajeError,
  type ProduccionesReporte, type ResumenFila, type ResumenTotales,
} from '../lib/reportes'

interface FilaResumen {
  idLote: number | ''
  idProduccionFina: number | ''
  idProduccionGruesa: number | ''
}

const inputCls =
  'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const labelCls = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1'

export default function ReporteResumen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const { permisos, empresas } = useAuth()
  const canRead = permisos.includes('lectura:reporte')
  const canWrite = permisos.includes('escritura:reporte')

  const [empresaId, setEmpresaId] = useState<number | ''>('')
  const [campania, setCampania] = useState(() => periodosCampania()[0] || '')
  const [filas, setFilas] = useState<FilaResumen[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cargandoEdit, setCargandoEdit] = useState(false)

  const { data: producciones, isLoading: loadingProducciones } = useSWR<ProduccionesReporte>(
    empresaId !== '' ? ['reportes/producciones', empresaId, campania] : null,
    () => getProducciones(Number(empresaId), campania),
  )

  // Edición: reconstruye el form desde el reporte guardado.
  useEffect(() => {
    if (!editId) return
    let cancelled = false
    setCargandoEdit(true)
    api
      .get(`/reportes/${editId}`)
      .then((r) => {
        if (cancelled) return
        const d = r.data as { idEmpresa: number; campania: string; filas: ResumenFila[] }
        setEmpresaId(d.idEmpresa)
        setCampania(d.campania)
        setFilas(
          d.filas.map((f) => ({
            idLote: f.idLote,
            idProduccionFina: f.idProduccionFina ?? '',
            idProduccionGruesa: f.idProduccionGruesa ?? '',
          })),
        )
      })
      .catch((e) => setError(mensajeError(e, 'No se pudo cargar el reporte.')))
      .finally(() => !cancelled && setCargandoEdit(false))
    return () => { cancelled = true }
  }, [editId])

  const produccionesDeLote = (loteId: number | '', tipo: 'fina' | 'gruesa') =>
    loteId === '' || !producciones
      ? []
      : producciones.producciones.filter((p) => p.idLote === Number(loteId) && p.tipoCosecha === tipo)

  const addFila = () => {
    setFilas((prev) => [...prev, { idLote: '', idProduccionFina: '', idProduccionGruesa: '' }])
  }

  const updateFila = (idx: number, patch: Partial<FilaResumen>) => {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }

  const removeFila = (idx: number) => {
    setFilas((prev) => prev.filter((_, i) => i !== idx))
  }

  // Al elegir el lote, si hay una sola producción de un tipo, se auto-carga.
  const handleLoteChange = (idx: number, value: number | '') => {
    const finas = produccionesDeLote(value, 'fina')
    const gruesas = produccionesDeLote(value, 'gruesa')
    updateFila(idx, {
      idLote: value,
      idProduccionFina: finas.length === 1 ? finas[0].id : '',
      idProduccionGruesa: gruesas.length === 1 ? gruesas[0].id : '',
    })
  }

  // Tabla calculada en vivo a partir de las producciones seleccionadas.
  const derivado = useMemo<{ filas: ResumenFila[]; totales: ResumenTotales } | null>(() => {
    if (!producciones) return null
    const filasCalc: ResumenFila[] = filas.map((f) => {
      const fina = producciones.producciones.find((p) => p.id === f.idProduccionFina)
      const gruesa = producciones.producciones.find((p) => p.id === f.idProduccionGruesa)
      const superficie = fina?.supSembrada ?? gruesa?.supSembrada ?? 0
      const margenLote = (fina?.margenBrutoSAlquilerLote ?? 0) + (gruesa?.margenBrutoSAlquilerLote ?? 0)
      return {
        id: null,
        idLote: f.idLote === '' ? 0 : Number(f.idLote),
        loteNombre: fina?.loteDescripcion ?? gruesa?.loteDescripcion ?? `Lote #${f.idLote || '—'}`,
        idProduccionFina: f.idProduccionFina === '' ? null : f.idProduccionFina,
        cultivoFinaNombre: fina?.cultivoNombre ?? null,
        idProduccionGruesa: f.idProduccionGruesa === '' ? null : f.idProduccionGruesa,
        cultivoGruesaNombre: gruesa?.cultivoNombre ?? null,
        margenBrutoHa: superficie > 0 ? margenLote / superficie : null,
        superficie: superficie || null,
        margenBrutoLote: margenLote || null,
      }
    })

    let superficieTotal = 0
    let margenTotal = 0
    let precioSoja: number | null = null
    for (const r of filasCalc) {
      superficieTotal += r.superficie ?? 0
      margenTotal += r.margenBrutoLote ?? 0
      const gruesa = producciones.producciones.find((p) => p.id === r.idProduccionGruesa)
      if (precioSoja === null && gruesa?.precioXQq) precioSoja = gruesa.precioXQq
    }
    const margenMedio = superficieTotal > 0 ? margenTotal / superficieTotal : 0

    return {
      filas: filasCalc,
      totales: {
        superficieTotal,
        margenBrutoTotal: margenTotal,
        margenBrutoMedioHa: margenMedio,
        eqSoja: precioSoja ? margenMedio / precioSoja : null,
      },
    }
  }, [filas, producciones])

  const check = (): { ok: boolean; error?: string } => {
    if (empresaId === '') return { ok: false, error: 'Seleccioná un productor.' }
    if (filas.length === 0) return { ok: false, error: 'Agregá al menos un lote.' }
    for (const f of filas) {
      if (f.idLote === '') return { ok: false, error: 'Cada fila debe tener un lote.' }
      if (f.idProduccionFina === '' && f.idProduccionGruesa === '') {
        return { ok: false, error: 'Cada lote debe tener al menos una producción (fina o gruesa).' }
      }
    }
    return { ok: true }
  }

  const buildPayload = () => ({
    idEmpresa: Number(empresaId),
    campania,
    tipo: 'resumen_campania' as const,
    filas: filas.map((f) => ({
      idLote: Number(f.idLote),
      idProduccionFina: f.idProduccionFina === '' ? undefined : Number(f.idProduccionFina),
      idProduccionGruesa: f.idProduccionGruesa === '' ? undefined : Number(f.idProduccionGruesa),
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
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Resumen Campaña</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {editId ? `Editando reporte #${editId}` : 'Nuevo reporte de resumen por lote'}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Productor</label>
                <select
                  value={empresaId}
                  onChange={(e) => {
                    setEmpresaId(e.target.value === '' ? '' : Number(e.target.value))
                    setFilas([])
                  }}
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
            </div>

            <div className="space-y-2">
              {filas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {loadingProducciones
                    ? 'Cargando producciones del productor...'
                    : 'Agregá un lote para elegir sus producciones de fina y gruesa.'}
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
                      <label className={labelCls}><Sprout className="size-3" strokeWidth={2} /> Producción fina (invierno)</label>
                      <select
                        value={f.idProduccionFina}
                        onChange={(e) => updateFila(idx, { idProduccionFina: e.target.value === '' ? '' : Number(e.target.value) })}
                        className={inputCls}
                      >
                        <option value="">Sin producción</option>
                        {produccionesDeLote(f.idLote, 'fina').map((p) => (
                          <option key={p.id} value={p.id}>{p.cultivoNombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}><Sprout className="size-3" strokeWidth={2} /> Producción gruesa (verano)</label>
                      <div className="flex gap-2">
                        <select
                          value={f.idProduccionGruesa}
                          onChange={(e) => updateFila(idx, { idProduccionGruesa: e.target.value === '' ? '' : Number(e.target.value) })}
                          className={inputCls}
                        >
                          <option value="">Sin producción</option>
                          {produccionesDeLote(f.idLote, 'gruesa').map((p) => (
                            <option key={p.id} value={p.id}>{p.cultivoNombre}</option>
                          ))}
                        </select>
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
              disabled={empresaId === '' || loadingProducciones}
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
                  <FileBarChart className="size-4" strokeWidth={1.75} />
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
                  RESUMEN CAMPAÑA {campania} · {empresas.find((e) => e.id === Number(empresaId))?.nombre}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lote</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cultivo invierno</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cultivo verano</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Margen bruto / ha</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Superficie (has)</th>
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Margen bruto lote</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {derivado.filas.map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 font-medium text-foreground">{r.loteNombre}</td>
                        <td className="px-4 py-3 text-foreground">{r.cultivoFinaNombre || '—'}</td>
                        <td className="px-4 py-3 text-foreground">{r.cultivoGruesaNombre || '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtPesos(r.margenBrutoHa)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.superficie != null ? r.superficie : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtPesos(r.margenBrutoLote)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Superficie total</span>
                  <span className="tabular-nums">{derivado.totales.superficieTotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Margen bruto total</span>
                  <span className="tabular-nums">{fmtPesos(derivado.totales.margenBrutoTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Margen bruto medio / ha</span>
                  <span className="tabular-nums">{fmtPesos(derivado.totales.margenBrutoMedioHa)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">EQ Soja</span>
                  <span className="tabular-nums">{derivado.totales.eqSoja != null ? derivado.totales.eqSoja : '—'}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
