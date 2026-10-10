import { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { X, AlertCircle, Loader2, Calendar, Clock, Building2 } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { todayLocalISO } from '../lib/campanias'
import SelectAutocomplete from './SelectAutocomplete'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

const nowLocalHM = (): string => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

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

interface Lote {
  id: number
  idEmpresa: number
  descripcion: string | null
  idCampo?: number | null
  campo?: { id: number; nombre: string } | null
}

interface MonitoreoModalProps {
  /** Producción fija (desde /campanias/:id). Sin preset se elige con el wizard. */
  campaniaId?: number | null
  /** Recibe el id de la producción del monitoreo creado. */
  onCreated: (idCampania: number) => void
  onClose: () => void
}

/**
 * Modal grande de "Nuevo monitoreo" (Producción y lista de Monitoreos).
 * Wizard productor→campaña→campo→lote→producción (auto si es única) +
 * fecha/hora/diagnóstico/observaciones. No abandona la vista que lo abre.
 */
export default function MonitoreoModal({ campaniaId: campaniaPreset, onCreated, onClose }: MonitoreoModalProps) {
  const { permisos, isSysAdmin, isAsesor, user, empresas } = useAuth()
  const isAdmin = isSysAdmin
  const canWrite = permisos.includes('escritura:monitoreo-lote') && (isAdmin || isAsesor)

  const empresasVisibles = useMemo(() => {
    if (isAdmin) return empresas
    const ids = (user?.idEmpresas || []).map(Number)
    return empresas.filter((e) => ids.includes(e.id))
  }, [isAdmin, user, empresas])

  const [idEmpresa, setIdEmpresa] = useState<number | ''>('')
  const [periodo, setPeriodo] = useState<string>('')
  const [idCampo, setIdCampo] = useState<number | ''>('')
  const [idLote, setIdLote] = useState<number | ''>('')
  const [idCampania, setIdCampania] = useState<number | ''>('')

  const [fecha, setFecha] = useState(todayLocalISO())
  const [hora, setHora] = useState(nowLocalHM())
  const [diagnostico, setDiagnostico] = useState('')
  const [observaciones, setObservaciones] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: lotes = [] } = useSWR<Lote[]>(canWrite ? '/lotes' : null, fetcher)

  const { data: campaniaPresetData } = useSWR<CampaniaOption>(
    canWrite && campaniaPreset != null ? `/campanias/${campaniaPreset}` : null,
    fetcher,
  )

  const {
    data: producciones = [],
    isLoading: loadingProduccion,
  } = useSWR<CampaniaOption[]>(
    canWrite && campaniaPreset == null && idEmpresa !== '' ? ['/campanias', 'produccion', idEmpresa] : null,
    async () => {
      const res = await api.get('/campanias', {
        params: { empresaIds: Number(idEmpresa) },
      })
      return res.data as CampaniaOption[]
    },
  )

  const periodosDisponibles = useMemo(
    () =>
      Array.from(new Set(producciones.map((p) => p.campania).filter((c): c is string => !!c)))
        .sort((a, b) => b.localeCompare(a, 'es')),
    [producciones],
  )

  const lotesEmpresa = useMemo(
    () => (idEmpresa === '' ? [] : lotes.filter((l) => l.idEmpresa === Number(idEmpresa))),
    [lotes, idEmpresa],
  )

  const camposOpciones = useMemo(() => {
    const seen = new Map<number, string>()
    let sinCampo = false
    for (const l of lotesEmpresa) {
      if (l.campo) seen.set(l.campo.id, l.campo.nombre)
      else sinCampo = true
    }
    const opciones = Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([value, label]) => ({ value, label }))
    if (sinCampo) opciones.push({ value: 0, label: 'Sin campo' })
    return opciones
  }, [lotesEmpresa])

  const lotesOpciones = useMemo(
    () =>
      lotesEmpresa
        .filter((l) => idCampo === '' || (l.idCampo ?? 0) === Number(idCampo))
        .map((l) => ({
          value: l.id,
          label: l.descripcion || `Lote #${l.id}`,
          campoNombre: l.campo?.nombre || 'Sin campo',
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [lotesEmpresa, idCampo],
  )

  const produccionesLote = useMemo(() => {
    if (campaniaPreset != null || periodo === '' || idLote === '') return []
    return producciones.filter(
      (p) => p.campania === periodo && p.lote?.id === Number(idLote) && p.cultivo,
    )
  }, [producciones, periodo, idLote, campaniaPreset])

  const campaniaResuelta: number | null = campaniaPreset != null
    ? Number(campaniaPreset)
    : idCampania !== ''
      ? Number(idCampania)
      : produccionesLote.length === 1
        ? produccionesLote[0].id
        : null

  const necesitaElegir = campaniaPreset == null && produccionesLote.length > 1 && idCampania === ''

  const canSave =
    canWrite &&
    campaniaResuelta != null &&
    fecha !== '' && hora !== '' &&
    diagnostico.trim() !== ''

  // Cierra con Escape (el backdrop también cierra salvo guardando).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      await api.post('/monitoreos', {
        idCampania: campaniaResuelta,
        fecha,
        hora: hora.length === 5 ? `${hora}:00` : hora,
        diagnostico: diagnostico.trim(),
        observaciones: observaciones.trim() || null,
      })
      onCreated(campaniaResuelta)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo guardar el monitoreo.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const labelCls = 'text-xs font-medium text-foreground'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={() => { if (!saving) onClose() }}
        aria-hidden
      />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg shadow-xl">
        <div className="sticky top-0 z-10 px-5 py-4 border-b border-border bg-card flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold text-foreground">Nuevo monitoreo</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Observación del asesor sobre una producción</p>
          </div>
          <button
            onClick={() => { if (!saving) onClose() }}
            disabled={saving}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50 cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {!canWrite ? (
            <div className="flex items-center gap-2 bg-destructive-soft text-destructive border border-destructive/30 rounded-lg px-4 py-3 text-sm">
              <AlertCircle className="size-4 shrink-0" strokeWidth={1.75} />
              <span>Solo asesores pueden registrar monitoreos.</span>
            </div>
          ) : (
            <>
              {/* Producción */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-primary" strokeWidth={1.75} />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Producción</h3>
                </div>

                {campaniaPreset != null ? (
                  <p className="text-sm text-foreground">
                    {campaniaPresetData?.lote?.descripcion || `Lote #${campaniaPresetData?.lote?.id ?? '—'}`}
                    {campaniaPresetData?.cultivo ? ` · ${campaniaPresetData.cultivo.nombre}` : ''}
                    {campaniaPresetData?.campania ? ` · Campaña ${campaniaPresetData.campania}` : ''}
                  </p>
                ) : (
                  <>
                    <SelectAutocomplete
                      label="Productor"
                      value={idEmpresa}
                      onChange={(v) => {
                        setIdEmpresa(Number(v))
                        setPeriodo('')
                        setIdCampo('')
                        setIdLote('')
                        setIdCampania('')
                      }}
                      options={empresasVisibles.map((e) => ({ value: e.id, label: e.nombre }))}
                      placeholder="Seleccionar productor..."
                      autoSelectSingle
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <SelectAutocomplete
                        label="Campaña"
                        value={periodo}
                        onChange={(v) => {
                          setPeriodo(String(v))
                          setIdCampo('')
                          setIdLote('')
                          setIdCampania('')
                        }}
                        options={periodosDisponibles.map((p) => ({ value: p, label: p }))}
                        placeholder={idEmpresa === '' ? 'Elegí primero el productor' : 'Seleccionar campaña...'}
                        disabled={idEmpresa === ''}
                        sort={{ by: 'alfabetico', direction: 'desc' }}
                        autoSelectSingle
                        defaultFirst
                      />
                      <SelectAutocomplete
                        label="Campo"
                        value={idCampo}
                        onChange={(v) => {
                          setIdCampo(v === '' ? '' : Number(v))
                          setIdLote('')
                          setIdCampania('')
                        }}
                        options={camposOpciones}
                        placeholder="Todos los campos"
                        disabled={periodo === ''}
                        clearable
                      />
                    </div>
                    <SelectAutocomplete
                      label="Lote"
                      value={idLote}
                      onChange={(v) => {
                        setIdLote(Number(v))
                        setIdCampania('')
                      }}
                      options={lotesOpciones.map((o) => ({ value: o.value, label: `${o.campoNombre} · ${o.label}` }))}
                      placeholder={periodo === '' ? 'Elegí campaña' : 'Seleccionar lote...'}
                      disabled={periodo === ''}
                      autoSelectSingle
                    />
                    {idEmpresa === '' ? (
                      <p className="text-[12px] text-muted-foreground">Elegí primero el productor.</p>
                    ) : loadingProduccion ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Cargando producciones...</span>
                      </div>
                    ) : periodo !== '' && idLote !== '' && produccionesLote.length === 0 ? (
                      <p className="text-[12px] text-warning-foreground">
                        Este lote no tiene producción en la campaña {periodo}.
                      </p>
                    ) : necesitaElegir ? (
                      <SelectAutocomplete
                        label="Producción (el lote tiene más de una)"
                        value={idCampania}
                        onChange={(v) => setIdCampania(Number(v))}
                        options={produccionesLote.map((p) => ({
                          value: p.id,
                          label: `${p.cultivo?.nombre ?? '—'}${p.variedad ? ` (${p.variedad.nombre})` : ''}`,
                        }))}
                        placeholder="Elegí la producción..."
                      />
                    ) : campaniaResuelta != null ? (
                      <p className="text-[12px] text-success">
                        Producción: {produccionesLote.find((p) => p.id === campaniaResuelta)?.cultivo?.nombre ?? '—'}
                        {(() => {
                          const v = produccionesLote.find((p) => p.id === campaniaResuelta)?.variedad
                          return v ? ` (${v.nombre})` : ''
                        })()}
                      </p>
                    ) : null}
                  </>
                )}
              </section>

              {/* Datos del monitoreo */}
              <section className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>
                      <Calendar className="size-3.5 inline mr-1 -mt-0.5" strokeWidth={1.75} />
                      Fecha
                    </label>
                    <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls + ' cursor-pointer'} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>
                      <Clock className="size-3.5 inline mr-1 -mt-0.5" strokeWidth={1.75} />
                      Hora
                    </label>
                    <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls + ' cursor-pointer'} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Diagnóstico</label>
                  <textarea
                    value={diagnostico}
                    onChange={(e) => setDiagnostico(e.target.value)}
                    placeholder="Estado del cultivo, plagas, malezas, humedad..."
                    rows={4}
                    className={`${inputCls} resize-y`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Comentarios / observaciones <span className="text-muted-foreground font-normal">(opcional)</span></label>
                  <textarea
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Recomendaciones, seguimiento..."
                    rows={3}
                    className={`${inputCls} resize-y`}
                  />
                </div>
              </section>

              {error && (
                <div className="flex items-center gap-2 bg-destructive-soft text-destructive border border-destructive/30 rounded-lg px-4 py-3 text-sm">
                  <AlertCircle className="size-4 shrink-0" strokeWidth={1.75} />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1 cursor-pointer px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || saving}
                  className="inline-flex flex-1 items-center justify-center gap-2 cursor-pointer px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {saving ? 'Guardando…' : 'Guardar monitoreo'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
