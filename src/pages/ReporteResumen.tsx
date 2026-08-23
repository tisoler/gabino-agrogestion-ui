import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import {
  Loader2, ArrowLeft, AlertCircle, FileBarChart, Sprout,
} from 'lucide-react'
import api, { esErrorDeAcceso } from '../lib/api'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { useAuth } from '../contexts/auth-context'
import { periodosCampania } from '../lib/campanias'
import {
  getProducciones, crearReporte, actualizarReporte,
  fmtPesos, mensajeError,
  type ProduccionesReporte, type ProduccionCandidata, type ResumenFila, type ResumenTotales,
} from '../lib/reportes'

interface FilaResumen {
  idLote: number | ''
  idProduccionFina: number | ''
  idProduccionGruesa: number | ''
  incluido: boolean
}

interface ResumenSavedFila {
  idLote: number
  idProduccionFina: number | null
  idProduccionGruesa: number | null
}

/**
 * Arma las filas automáticas: un set campo+lote por cada lote con al menos una
 * producción fina y/o gruesa. En creación todos quedan incluidos; en edición
 * sólo los que tiene el reporte guardado.
 */
function buildFilasResumen(
  prods: ProduccionesReporte,
  saved?: ResumenSavedFila[],
): FilaResumen[] {
  const porLote = new Map<number, ProduccionCandidata[]>()
  for (const p of prods.producciones) {
    if (p.tipoCosecha !== 'fina' && p.tipoCosecha !== 'gruesa') continue
    if (!porLote.has(p.idLote)) porLote.set(p.idLote, [])
    porLote.get(p.idLote)!.push(p)
  }
  const incluidos = new Set((saved || []).map((s) => s.idLote))
  return prods.lotes
    .filter((l) => porLote.has(l.id))
    .map((l): FilaResumen | null => {
      const finas = (porLote.get(l.id) || []).filter((p) => p.tipoCosecha === 'fina')
      const gruesas = (porLote.get(l.id) || []).filter((p) => p.tipoCosecha === 'gruesa')
      if (finas.length === 0 && gruesas.length === 0) return null
      const savedRow = saved?.find((s) => s.idLote === l.id)
      return {
        idLote: l.id,
        idProduccionFina:
          savedRow?.idProduccionFina != null && finas.some((p) => p.id === savedRow.idProduccionFina)
            ? savedRow.idProduccionFina
            : finas.length === 1
              ? finas[0].id
              : '',
        idProduccionGruesa:
          savedRow?.idProduccionGruesa != null && gruesas.some((p) => p.id === savedRow.idProduccionGruesa)
            ? savedRow.idProduccionGruesa
            : gruesas.length === 1
              ? gruesas[0].id
              : '',
        incluido: saved ? incluidos.has(l.id) : true,
      }
    })
    .filter((x): x is FilaResumen => x !== null)
}

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
  const [editFilas, setEditFilas] = useState<ResumenSavedFila[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cargandoEdit, setCargandoEdit] = useState(false)
  const autoBuildRef = useRef<string | null>(null)

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
        const d = r.data as { idEmpresa: number; campania: string; filas: ResumenSavedFila[] }
        setEmpresaId(d.idEmpresa)
        setCampania(d.campania)
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

  // Auto-agregar todos los sets campo+lote al elegir productor + campaña
  // (o al cargar la edición). Se reconstruye una vez por combinación.
  useEffect(() => {
    if (empresaId === '' || !producciones) return
    const key = `${empresaId}|${campania}|${editId ?? ''}|${editFilas?.length ?? -1}`
    if (autoBuildRef.current === key) return
    autoBuildRef.current = key
    setFilas(buildFilasResumen(producciones, editFilas ?? undefined))
  }, [producciones, empresaId, campania, editFilas, editId])

  const produccionesDeLote = (loteId: number | '', tipo: 'fina' | 'gruesa') =>
    loteId === '' || !producciones
      ? []
      : producciones.producciones.filter((p) => p.idLote === Number(loteId) && p.tipoCosecha === tipo)

  const updateFila = (idx: number, patch: Partial<FilaResumen>) => {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }

  const toggleFila = (idx: number) => {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, incluido: !f.incluido } : f)))
  }

  // Al elegir otra producción de un tipo, si hay una sola opción se auto-elige.
  const handleProduccionChange = (idx: number, tipo: 'fina' | 'gruesa', valor: number | '') => {
    updateFila(idx, tipo === 'fina' ? { idProduccionFina: valor } : { idProduccionGruesa: valor })
  }

  // Tabla calculada en vivo a partir de las producciones seleccionadas.
  const derivado = useMemo<{ filas: ResumenFila[]; totales: ResumenTotales } | null>(() => {
    if (!producciones) return null
    const filasCalc: ResumenFila[] = filas
      .filter((f) => f.incluido)
      .map((f) => {
        const fina = producciones.producciones.find((p) => p.id === f.idProduccionFina)
        const gruesa = producciones.producciones.find((p) => p.id === f.idProduccionGruesa)
        const lote = producciones.lotes.find((l) => l.id === Number(f.idLote))
        const superficie = fina?.supSembrada ?? gruesa?.supSembrada ?? 0
        const margenLote = (fina?.margenBrutoSAlquilerLote ?? 0) + (gruesa?.margenBrutoSAlquilerLote ?? 0)
        return {
          id: null,
          idLote: f.idLote === '' ? 0 : Number(f.idLote),
          loteNombre: lote?.descripcion || fina?.loteDescripcion || gruesa?.loteDescripcion || `Lote #${f.idLote || '—'}`,
          campoNombre: lote?.campoNombre ?? fina?.campoNombre ?? gruesa?.campoNombre ?? null,
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
    if (filas.length === 0) return { ok: false, error: 'No hay producciones para el productor y campaña seleccionados.' }
    const incluidas = filas.filter((f) => f.incluido)
    if (incluidas.length === 0) return { ok: false, error: 'Incluí al menos un lote en el reporte.' }
    for (const f of incluidas) {
      if (f.idLote === '') return { ok: false, error: 'Cada fila debe tener un lote.' }
      if (f.idProduccionFina === '' && f.idProduccionGruesa === '') {
        return { ok: false, error: 'Cada lote incluido debe tener al menos una producción (fina o gruesa).' }
      }
    }
    return { ok: true }
  }

  const buildPayload = () => ({
    idEmpresa: Number(empresaId),
    campania,
    tipo: 'resumen_campania' as const,
    filas: filas
      .filter((f) => f.incluido)
      .map((f) => ({
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
            className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
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
                <SelectAutocomplete
                  value={empresaId}
                  onChange={(v) => {
                    setEmpresaId(v === '' ? '' : Number(v))
                    setFilas([])
                  }}
                  options={[{ value: '', label: 'Seleccionar productor...' }, ...empresas.map((e) => ({ value: e.id, label: e.nombre }))]}
                  placeholder="Seleccionar productor..."
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
            </div>

            <div className="space-y-2">
              {filas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {loadingProducciones
                    ? 'Cargando producciones del productor...'
                    : 'Seleccioná un productor y campaña para cargar los lotes disponibles.'}
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
                        <div className="flex items-center gap-1.5 text-sm min-w-0">
                          <Sprout className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="font-medium text-foreground truncate">{lote?.campoNombre || '—'}</span>
                          <span className="text-muted-foreground shrink-0">·</span>
                          <span className="text-foreground truncate">{lote?.descripcion || `Lote #${f.idLote}`}</span>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className={labelCls}><Sprout className="size-3" strokeWidth={2} /> Producción fina (invierno)</label>
                          <SelectAutocomplete
                            disabled={excluido}
                            value={f.idProduccionFina}
                            onChange={(v) => handleProduccionChange(idx, 'fina', v === '' ? '' : Number(v))}
                            options={[{ value: '', label: 'Sin producción' }, ...produccionesDeLote(f.idLote, 'fina').map((p) => ({ value: p.id, label: p.cultivoNombre }))]}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className={labelCls}><Sprout className="size-3" strokeWidth={2} /> Producción gruesa (verano)</label>
                          <SelectAutocomplete
                            disabled={excluido}
                            value={f.idProduccionGruesa}
                            onChange={(v) => handleProduccionChange(idx, 'gruesa', v === '' ? '' : Number(v))}
                            options={[{ value: '', label: 'Sin producción' }, ...produccionesDeLote(f.idLote, 'gruesa').map((p) => ({ value: p.id, label: p.cultivoNombre }))]}
                          />
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
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
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
                      <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campo</th>
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
                        <td className="px-4 py-3 text-foreground">{r.campoNombre || '—'}</td>
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
