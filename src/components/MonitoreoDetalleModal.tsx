import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { X, Calendar, Clock, Building2, MapPin, Sprout, ArrowUpRight, AudioLines, Check, Pencil, Loader2 } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { fmtFecha } from '../lib/prescripciones'

interface CampaniaOption {
  id: number
  campania?: string
  lote?: {
    id: number
    descripcion: string | null
    idEmpresa: number
    idCampo?: number | null
    campo?: { id: number; nombre: string } | null
  } | null
  cultivo?: { id: number; nombre: string } | null
  variedad?: { id: number; nombre: string } | null
}

interface LoteOption {
  id: number
  idEmpresa: number
  descripcion: string | null
  idCampo?: number | null
  campo?: { id: number; nombre: string } | null
}

/**
 * Campaña de monitoreo vigente (abr–mar), espejo de la regla del móvil/API:
 * oct-2026 → "26/27", feb-2027 → "26/27".
 */
function periodoMonitoreoActual(fecha: Date = new Date()): string {
  const anio = fecha.getFullYear()
  const y = fecha.getMonth() >= 3 ? anio : anio - 1
  return `${String(y % 100).padStart(2, '0')}/${String((y + 1) % 100).padStart(2, '0')}`
}

export interface MonitoreoDetalle {
  id: number
  fecha: string
  hora: string
  diagnostico: string
  observaciones: string | null
  estado?: string
  origen?: string | null
  audioUrl?: string | null
  transcripcionEstado?: string | null
  campania?: {
    id: number
    campania?: string
    lote?: {
      id: number
      descripcion: string | null
      idEmpresa: number
      campo?: { id: number; nombre: string } | null
    } | null
    cultivo?: { id: number; nombre: string } | null
    variedad?: { id: number; nombre: string } | null
  } | null
}

interface MonitoreoDetalleModalProps {
  monitoreo: MonitoreoDetalle
  /** Nombre del productor (la lista lo resuelve; la producción lo conoce). */
  productor?: string
  onClose: () => void
  /** Si puede confirmar borradores (solo lista con permiso de escritura). */
  puedeConfirmar?: boolean
  onConfirmado?: () => void
  /** Si puede editar el borrador (cambiar producción y textos). */
  editable?: boolean
  onActualizado?: () => void
}

/** Detalle de un monitoreo: lectura, y edición si es borrador con permiso. */
export default function MonitoreoDetalleModal({ monitoreo, productor, onClose, puedeConfirmar, onConfirmado, editable, onActualizado }: MonitoreoDetalleModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const esBorrador = monitoreo.estado === 'borrador'
  const [confirmando, setConfirmando] = useState(false)
  const [errorConfirmar, setErrorConfirmar] = useState<string | null>(null)

  // Edición del borrador (producción + textos).
  const [actual, setActual] = useState(monitoreo)
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [fIdEmpresa, setFIdEmpresa] = useState<number | ''>('')
  const [fIdLote, setFIdLote] = useState<number | ''>('')
  const [fIdCampania, setFIdCampania] = useState<number | ''>('')
  const [fDiagnostico, setFDiagnostico] = useState('')
  const [fObservaciones, setFObservaciones] = useState('')

  // La campaña de monitoreo es fija (abr–mar, igual que al crear): no se cambia.
  const periodoFijo = actual.campania?.campania ?? periodoMonitoreoActual()

  const { user, empresas, isSysAdmin } = useAuth()
  const empresasVisibles = useMemo(() => {
    if (isSysAdmin) return empresas
    const ids = (user?.idEmpresas || []).map(Number)
    return empresas.filter((e) => ids.includes(e.id))
  }, [isSysAdmin, user, empresas])

  const { data: lotes = [] } = useSWR<LoteOption[]>(
    editable && editando ? '/lotes' : null, fetcher, { revalidateOnFocus: false },
  )
  const { data: producciones = [] } = useSWR<CampaniaOption[]>(
    editable && editando && fIdEmpresa !== '' ? ['edit-monitoreo-prods', fIdEmpresa] : null,
    async () => {
      const res = await api.get('/campanias', { params: { empresaIds: Number(fIdEmpresa) } })
      return res.data as CampaniaOption[]
    },
    { revalidateOnFocus: false },
  )

  const lotesEmpresa = useMemo(
    () => (fIdEmpresa === '' ? [] : lotes.filter((l) => l.idEmpresa === Number(fIdEmpresa))
      .sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || '', 'es'))),
    [lotes, fIdEmpresa],
  )
  const produccionesLote = useMemo(() => {
    if (fIdLote === '') return []
    return producciones.filter(
      (p) => p.campania === periodoFijo && p.lote?.id === Number(fIdLote) && p.cultivo,
    )
  }, [producciones, periodoFijo, fIdLote])
  const campaniaResuelta: number | null =
    fIdCampania !== '' ? Number(fIdCampania)
      : produccionesLote.length === 1 ? produccionesLote[0].id : null

  const empezarEdicion = () => {
    const c = actual.campania
    setFIdEmpresa(c?.lote?.idEmpresa ?? '')
    setFIdLote(c?.lote?.id ?? '')
    setFIdCampania(c?.id ?? '')
    setFDiagnostico(actual.diagnostico)
    setFObservaciones(actual.observaciones ?? '')
    setErrorGuardar(null)
    setEditando(true)
  }

  const guardarEdicion = async () => {
    if (guardando || fDiagnostico.trim() === '') return
    setGuardando(true)
    setErrorGuardar(null)
    try {
      const res = await api.patch(`/monitoreos/${actual.id}`, {
        ...(campaniaResuelta != null ? { idCampania: campaniaResuelta } : {}),
        diagnostico: fDiagnostico.trim(),
        observaciones: fObservaciones.trim() || null,
      })
      setActual(res.data as MonitoreoDetalle)
      setEditando(false)
      onActualizado?.()
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err.response?.data?.message
      setErrorGuardar(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    if (eliminando) return
    if (!window.confirm('Eliminar este borrador (también del servidor). No se puede deshacer.')) return
    setEliminando(true)
    try {
      await api.delete(`/monitoreos/${actual.id}`)
      onActualizado?.()
      onClose()
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err.response?.data?.message
      setErrorConfirmar(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo eliminar.')
    } finally {
      setEliminando(false)
    }
  }

  const confirmar = async () => {
    if (confirmando) return
    setConfirmando(true)
    setErrorConfirmar(null)
    try {
      await api.patch(`/monitoreos/${monitoreo.id}`, { estado: 'confirmado' })
      onConfirmado?.()
      onClose()
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } }; message?: string }
      const msg = err.response?.data?.message
      setErrorConfirmar(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo confirmar.')
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg shadow-xl">
        <div className="sticky top-0 z-10 px-5 py-4 border-b border-border bg-card flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold text-foreground">Monitoreo</h2>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {fmtFecha(monitoreo.fecha)} · {monitoreo.hora?.slice(0, 5)}
            </p>
            {esBorrador && (
              <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                Borrador · a revisar
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2 min-w-0">
              <Calendar className="size-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Fecha</dt>
                <dd className="text-foreground">{fmtFecha(actual.fecha)}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2 min-w-0">
              <Clock className="size-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Hora</dt>
                <dd className="text-foreground tabular-nums">{actual.hora?.slice(0, 5)}</dd>
              </div>
            </div>
            {productor && (
              <div className="flex items-start gap-2 min-w-0 col-span-2">
                <Building2 className="size-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
                <div className="min-w-0">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Productor</dt>
                  <dd className="text-foreground">{productor}</dd>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2 min-w-0 col-span-2">
              <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Campo · Lote</dt>
                {actual.campania?.lote ? (
                  <dd className="text-foreground">
                    {actual.campania.lote?.campo?.nombre ?? 'Sin campo'} · {actual.campania.lote?.descripcion || (actual.campania.lote ? `Lote #${actual.campania.lote.id}` : '—')}
                  </dd>
                ) : (
                  <dd className="text-amber-700 dark:text-amber-300 font-medium">
                    Lote por resolver (borrador de audio)
                  </dd>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2 min-w-0 col-span-2">
              <Sprout className="size-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Cultivo</dt>
                <dd className="text-foreground">
                  {actual.campania?.cultivo
                    ? `${actual.campania.cultivo.nombre}${actual.campania.variedad ? ` (${actual.campania.variedad.nombre})` : ''}`
                    : '—'}
                  {actual.campania?.campania ? ` · Campaña ${actual.campania.campania}` : ''}
                </dd>
              </div>
            </div>
          </dl>

          {editando ? (
            <>
              <div className="space-y-3 border border-border rounded-lg p-4 bg-muted/20">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Producción</h3>
                <p className="text-xs font-medium text-foreground bg-primary/10 border border-primary/30 rounded-md px-3 py-2">
                  Campaña {periodoFijo}
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Productor</label>
                  <select
                    value={fIdEmpresa}
                    onChange={(e) => {
                      setFIdEmpresa(e.target.value === '' ? '' : Number(e.target.value))
                      setFIdLote(''); setFIdCampania('')
                    }}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground cursor-pointer"
                  >
                    <option value="">Seleccionar…</option>
                    {empresasVisibles.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Lote</label>
                  <select
                    value={fIdLote}
                    onChange={(e) => { setFIdLote(e.target.value === '' ? '' : Number(e.target.value)); setFIdCampania('') }}
                    disabled={fIdEmpresa === ''}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground disabled:opacity-50 cursor-pointer"
                  >
                    <option value="">Seleccionar…</option>
                    {lotesEmpresa.map((l) => (
                      <option key={l.id} value={l.id}>
                        {(l.campo?.nombre || 'Sin campo')} · {(l.descripcion || `Lote #${l.id}`)}
                      </option>
                    ))}
                  </select>
                </div>
                {produccionesLote.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Producción (el lote tiene más de una)</label>
                    <select
                      value={fIdCampania}
                      onChange={(e) => setFIdCampania(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground cursor-pointer"
                    >
                      <option value="">Seleccionar…</option>
                      {produccionesLote.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.cultivo?.nombre ?? '—'}{p.variedad ? ` (${p.variedad.nombre})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {fIdLote !== '' && produccionesLote.length === 0 && (
                  <p className="text-xs text-muted-foreground">Este lote no tiene producción en la campaña {periodoFijo}.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Diagnóstico</label>
                <textarea
                  value={fDiagnostico}
                  onChange={(e) => setFDiagnostico(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground resize-y"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Comentarios / observaciones</label>
                <textarea
                  value={fObservaciones}
                  onChange={(e) => setFObservaciones(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground resize-y"
                />
              </div>
              {errorGuardar && (
                <p className="text-sm text-destructive">{errorGuardar}</p>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Diagnóstico</h3>
                <p className="text-sm text-foreground whitespace-pre-wrap">{actual.diagnostico}</p>
              </div>

              {actual.observaciones && (
                <div className="space-y-1.5">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Comentarios / observaciones
                  </h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{actual.observaciones}</p>
                </div>
              )}
            </>
          )}

          {actual.audioUrl && (
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <AudioLines className="size-3.5" strokeWidth={1.75} /> Audio original
              </h3>
              <audio controls src={actual.audioUrl} className="w-full" preload="none" />
            </div>
          )}

          {errorConfirmar && (
            <p className="text-sm text-destructive">{errorConfirmar}</p>
          )}

          <div className="flex gap-2 pt-1 flex-wrap">
            {editando ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  disabled={guardando}
                  className="flex-1 cursor-pointer px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={guardarEdicion}
                  disabled={guardando || fDiagnostico.trim() === ''}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 cursor-pointer px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {guardando && <Loader2 className="size-4 animate-spin" />}
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </>
            ) : (
              <>
                {esBorrador && editable && (
                  <button
                    type="button"
                    onClick={empezarEdicion}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 cursor-pointer px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    <Pencil className="size-4" strokeWidth={1.75} />
                    Editar
                  </button>
                )}
                {esBorrador && editable && (
                  <button
                    type="button"
                    onClick={eliminar}
                    disabled={eliminando}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 cursor-pointer px-4 py-2 border border-destructive/50 text-destructive rounded-md text-sm font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    <X className="size-4" strokeWidth={1.75} />
                    {eliminando ? 'Eliminando…' : 'Eliminar'}
                  </button>
                )}
                {esBorrador && puedeConfirmar && (
                  actual.campania ? (
                    <button
                      type="button"
                      onClick={confirmar}
                      disabled={confirmando}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
                    >
                      <Check className="size-4" strokeWidth={2} />
                      {confirmando ? 'Confirmando…' : 'Confirmar'}
                    </button>
                  ) : (
                    <p className="flex-1 text-xs text-muted-foreground text-center self-center">
                      Resolvé el lote con Editar para poder confirmar.
                    </p>
                  )
                )}
              </>
            )}
            {actual.campania && !editando && (
              <Link
                to={`/campanias/${actual.campania.id}`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <ArrowUpRight className="size-4" strokeWidth={1.75} />
                Ver producción
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 cursor-pointer px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
