import { useState, useEffect, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, AlertCircle, Loader2, Save, Check, X,
  Sprout, MapPin, Calendar, Package, Pickaxe, DollarSign, FileDown,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  fmtMoneda, fmtNumero, fmtQQHa, todayLocalISO,
  costoPonderadoHa, costoTotalInsumoRowHa, costoTotalCostoRowHa,
  calcularResultados,
  type Campania, type CampaniaLaborDetalle, type CampaniaInsumoDetalle,
  type CampaniaCostoDetalle, type LaborItem, type InsumoItem, type CostoItem,
} from '../lib/campanias'

// ---------------------------------------------------------------------------
// Tipos auxiliares y fetchers
// ---------------------------------------------------------------------------
interface Lote {
  id: number
  idEmpresa: number
  descripcion: string | null
}
interface Cultivo {
  id: number
  nombre: string
  variedades: { id: number; nombre: string }[]
}

const fetcher = (url: string) => api.get(url).then((r) => r.data)
const currentYear = new Date().getFullYear()

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type Cabecera = {
  nombre: string
  anioDesde: number
  anioHasta: number
  idLote: number | null
  idCultivo: number | null
  idVariedad: number | null
  supSembrada: string
  supCosechada: string
  prodNetaTotalQq: string
  precioXQq: string
  alquilerQqHa: string
  comercializacionPct: string
  cosechaXHa: string
}

const emptyCabecera = (): Cabecera => ({
  nombre: '',
  anioDesde: currentYear,
  anioHasta: currentYear,
  idLote: null,
  idCultivo: null,
  idVariedad: null,
  supSembrada: '',
  supCosechada: '',
  prodNetaTotalQq: '',
  precioXQq: '',
  alquilerQqHa: '',
  comercializacionPct: '',
  cosechaXHa: '',
})

const numericFields: (keyof Cabecera)[] = [
  'supSembrada', 'supCosechada', 'prodNetaTotalQq', 'precioXQq',
  'alquilerQqHa', 'comercializacionPct', 'cosechaXHa',
]

function buildPatchPayload(next: Cabecera, saved: Cabecera): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (next.nombre !== saved.nombre) payload.nombre = next.nombre
  if (next.anioDesde !== saved.anioDesde) payload.anioDesde = next.anioDesde
  if (next.anioHasta !== saved.anioHasta) payload.anioHasta = next.anioHasta
  if (next.idLote !== saved.idLote) payload.idLote = next.idLote
  if (next.idCultivo !== saved.idCultivo) payload.idCultivo = next.idCultivo
  if (next.idVariedad !== saved.idVariedad) payload.idVariedad = next.idVariedad
  for (const k of numericFields) {
    const v = next[k] as string
    const s = saved[k] as string
    if (v !== s) {
      payload[k] = v === '' ? null : parseFloat(v)
    }
  }
  return payload
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function CampaniaDetalle() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const isNew = !params.id || params.id === 'nueva'

  const { permisos, isSysAdmin, currentEmpresaId, empresas } = useAuth()
  const canWrite = permisos.includes('escritura:campania')
  const canRead = permisos.includes('lectura:campania')

  const [empresaDestinoId, setEmpresaDestinoId] = useState<number | null>(
    isNew ? (isSysAdmin ? null : currentEmpresaId) : null
  )

  const [cabecera, setCabecera] = useState<Cabecera>(emptyCabecera)
  const [cabeceraSaved, setCabeceraSaved] = useState<Cabecera>(emptyCabecera)
  const [saveStatus, setSaveStatus] = useState<Partial<Record<keyof Cabecera, SaveStatus>>>({})
  const [campaniaId, setCampaniaId] = useState<number | null>(isNew ? null : Number(params.id))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [labores, setLabores] = useState<CampaniaLaborDetalle[]>([])
  const [insumos, setInsumos] = useState<CampaniaInsumoDetalle[]>([])
  const [costos, setCostos] = useState<CampaniaCostoDetalle[]>([])

  // Catálogos
  const { data: lotes = [], isLoading: loadingLotes } = useSWR<Lote[]>(
    canRead ? '/lotes' : null, fetcher
  )
  const { data: cultivos = [] } = useSWR<Cultivo[]>(canRead ? '/cultivos' : null, fetcher)

  const catalogParams = useMemo(() => {
    const p: Record<string, unknown> = {}
    if (empresaDestinoId) p.currentEmpresaId = empresaDestinoId
    return p
  }, [empresaDestinoId])

  const catalogFetcher = useCallback(
    (url: string) => api.get(url, { params: catalogParams }).then((r) => r.data),
    [catalogParams]
  )
  const { data: catalogLabores = [], mutate: refetchLabores } = useSWR<LaborItem[]>(
    canRead && campaniaId !== null ? ['/labores', catalogParams] : null,
    () => catalogFetcher('/labores')
  )
  const { data: catalogInsumos = [], mutate: refetchInsumos } = useSWR<InsumoItem[]>(
    canRead && campaniaId !== null ? ['/insumos', catalogParams] : null,
    () => catalogFetcher('/insumos')
  )
  const { data: catalogCostos = [], mutate: refetchCostos } = useSWR<CostoItem[]>(
    canRead && campaniaId !== null ? ['/costos', catalogParams] : null,
    () => catalogFetcher('/costos')
  )

  // Campaña existente
  const { data: campania, isLoading: loadingCampania, mutate: refetchCampania } = useSWR<Campania>(
    canRead && !isNew ? `/campanias/${params.id}` : null,
    fetcher
  )

  useEffect(() => {
    if (!campania) return
    setCampaniaId(campania.id)
    const next: Cabecera = {
      nombre: campania.nombre ?? '',
      anioDesde: campania.anioDesde,
      anioHasta: campania.anioHasta,
      idLote: campania.idLote,
      idCultivo: campania.idCultivo,
      idVariedad: campania.idVariedad ?? null,
      supSembrada: campania.supSembrada != null ? String(campania.supSembrada) : '',
      supCosechada: campania.supCosechada != null ? String(campania.supCosechada) : '',
      prodNetaTotalQq: campania.prodNetaTotalQq != null ? String(campania.prodNetaTotalQq) : '',
      precioXQq: campania.precioXQq != null ? String(campania.precioXQq) : '',
      alquilerQqHa: campania.alquilerQqHa != null ? String(campania.alquilerQqHa) : '',
      comercializacionPct: campania.comercializacionPct != null ? String(campania.comercializacionPct) : '',
      cosechaXHa: campania.cosechaXHa != null ? String(campania.cosechaXHa) : '',
    }
    setCabecera(next)
    setCabeceraSaved(next)
    setLabores(campania.labores || [])
    setInsumos(campania.insumos || [])
    setCostos(campania.costos || [])
    if (campania.lote) setEmpresaDestinoId(campania.lote.idEmpresa)
  }, [campania])

  const lotesFiltrados = useMemo(() => {
    if (!empresaDestinoId) return []
    return lotes.filter((l) => l.idEmpresa === empresaDestinoId)
  }, [lotes, empresaDestinoId])

  const variedadesFiltradas = useMemo(() => {
    if (!cabecera.idCultivo) return []
    const c = cultivos.find((x) => x.id === cabecera.idCultivo)
    return c?.variedades || []
  }, [cultivos, cabecera.idCultivo])

  const resultados = useMemo(() => calcularResultados({
    supSembrada: parseFloat(cabecera.supSembrada) || 0,
    supCosechada: parseFloat(cabecera.supCosechada) || 0,
    prodNetaTotalQq: parseFloat(cabecera.prodNetaTotalQq) || 0,
    precioXQq: parseFloat(cabecera.precioXQq) || 0,
    comercializacionPct: parseFloat(cabecera.comercializacionPct) || 0,
    cosechaXHa: parseFloat(cabecera.cosechaXHa) || 0,
    alquilerQqHa: parseFloat(cabecera.alquilerQqHa) || 0,
    labores, insumos, costos,
  }), [cabecera, labores, insumos, costos])

  // Modal: crear ítem in-situ de catálogo
  const [creatingItem, setCreatingItem] = useState<{
    kind: 'labor' | 'insumo' | 'costo'
    nombre: string
    onCreated: (id: number) => void
  } | null>(null)

  // -------------------------------------------------------------------------
  // Crear campaña (al click inicial cuando es nueva)
  // -------------------------------------------------------------------------
  const canCreate = useMemo(() => {
    return (
      cabecera.idLote !== null &&
      cabecera.idCultivo !== null &&
      cabecera.nombre.trim() !== '' &&
      cabecera.anioDesde > 0 &&
      cabecera.anioHasta >= cabecera.anioDesde
    )
  }, [cabecera])

  const handleCreate = async () => {
    if (!canCreate || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const payload: Record<string, unknown> = {
        nombre: cabecera.nombre.trim(),
        anioDesde: cabecera.anioDesde,
        anioHasta: cabecera.anioHasta,
        idLote: cabecera.idLote,
        idCultivo: cabecera.idCultivo,
      }
      if (cabecera.idVariedad) payload.idVariedad = cabecera.idVariedad
      for (const k of numericFields) {
        const v = cabecera[k] as string
        if (v !== '') payload[k] = parseFloat(v)
      }
      const { data } = await api.post('/campanias', payload)
      setCampaniaId(data.id)
      setCabeceraSaved(cabecera)
      navigate(`/campanias/${data.id}`, { replace: true })
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      setCreateError(e?.response?.data?.message || 'Error al crear la campaña')
    } finally {
      setCreating(false)
    }
  }

  // -------------------------------------------------------------------------
  // Autosave por campo (después de creada la campaña)
  // -------------------------------------------------------------------------
  const saveField = async (field: keyof Cabecera) => {
    if (!campaniaId) return
    const next: Cabecera = { ...cabecera, [field]: cabecera[field] }
    const payload = buildPatchPayload(next, cabeceraSaved)
    if (Object.keys(payload).length === 0) return
    setSaveStatus((s) => ({ ...s, [field]: 'saving' }))
    try {
      const { data } = await api.patch(`/campanias/${campaniaId}`, payload)
      setCabeceraSaved(next)
      setSaveStatus((s) => ({ ...s, [field]: 'saved' }))
      setTimeout(() => {
        setSaveStatus((s) => {
          if (s[field] === 'saved') return { ...s, [field]: 'idle' }
          return s
        })
      }, 1500)
      if (payload.idLote && data?.lote) {
        setEmpresaDestinoId(data.lote.idEmpresa)
      }
    } catch (e) {
      setSaveStatus((s) => ({ ...s, [field]: 'error' }))
      console.error('autosave failed', field, e)
    }
  }

  const setCab = <K extends keyof Cabecera>(field: K, value: Cabecera[K]) => {
    setCabecera((c) => ({ ...c, [field]: value }))
  }

  // -------------------------------------------------------------------------
  // Acciones sobre detalles
  // -------------------------------------------------------------------------
  const addLabor = async () => {
    if (!campaniaId || catalogLabores.length === 0) return
    const { data } = await api.post(`/campanias/${campaniaId}/labores`, {
      idLabor: catalogLabores[0].id,
      fecha: todayLocalISO(),
      superficieLaboreada: 0,
      costoLaborHa: 0,
    })
    setLabores((arr) => [...arr, { ...data, labor: catalogLabores.find((l) => l.id === data.idLabor) }])
  }

  const updateLabor = async (id: number, patch: Partial<CampaniaLaborDetalle>) => {
    if (!campaniaId) return
    setLabores((arr) => arr.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    try {
      await api.patch(`/campanias/${campaniaId}/labores/${id}`, patch)
    } catch (e) {
      refetchCampania()
      console.error('updateLabor failed', e)
    }
  }

  const removeLabor = async (id: number) => {
    if (!campaniaId) return
    if (!confirm('¿Eliminar esta labor?')) return
    setLabores((arr) => arr.filter((l) => l.id !== id))
    try {
      await api.delete(`/campanias/${campaniaId}/labores/${id}`)
    } catch (e) {
      refetchCampania()
      console.error('removeLabor failed', e)
    }
  }

  const addInsumo = async () => {
    if (!campaniaId || catalogInsumos.length === 0) return
    const { data } = await api.post(`/campanias/${campaniaId}/insumos`, {
      idInsumo: catalogInsumos[0].id,
      unidadesHa: 0,
      costoUnidad: 0,
    })
    setInsumos((arr) => [...arr, { ...data, insumo: catalogInsumos.find((i) => i.id === data.idInsumo) }])
  }

  const updateInsumo = async (id: number, patch: Partial<CampaniaInsumoDetalle>) => {
    if (!campaniaId) return
    setInsumos((arr) => arr.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    try {
      await api.patch(`/campanias/${campaniaId}/insumos/${id}`, patch)
    } catch (e) {
      refetchCampania()
      console.error('updateInsumo failed', e)
    }
  }

  const removeInsumo = async (id: number) => {
    if (!campaniaId) return
    if (!confirm('¿Eliminar este insumo?')) return
    setInsumos((arr) => arr.filter((i) => i.id !== id))
    try {
      await api.delete(`/campanias/${campaniaId}/insumos/${id}`)
    } catch (e) {
      refetchCampania()
      console.error('removeInsumo failed', e)
    }
  }

  const addCosto = async () => {
    if (!campaniaId || catalogCostos.length === 0) return
    const { data } = await api.post(`/campanias/${campaniaId}/costos`, {
      idCosto: catalogCostos[0].id,
      unidadesHa: 0,
      costoUnidad: 0,
    })
    setCostos((arr) => [...arr, { ...data, costo: catalogCostos.find((c) => c.id === data.idCosto) }])
  }

  const updateCosto = async (id: number, patch: Partial<CampaniaCostoDetalle>) => {
    if (!campaniaId) return
    setCostos((arr) => arr.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    try {
      await api.patch(`/campanias/${campaniaId}/costos/${id}`, patch)
    } catch (e) {
      refetchCampania()
      console.error('updateCosto failed', e)
    }
  }

  const removeCosto = async (id: number) => {
    if (!campaniaId) return
    if (!confirm('¿Eliminar este costo?')) return
    setCostos((arr) => arr.filter((c) => c.id !== id))
    try {
      await api.delete(`/campanias/${campaniaId}/costos/${id}`)
    } catch (e) {
      refetchCampania()
      console.error('removeCosto failed', e)
    }
  }

  const handleCreateCatalogItem = async () => {
    if (!creatingItem || !creatingItem.nombre.trim() || !empresaDestinoId) return
    const endpoint = creatingItem.kind === 'labor' ? '/labores'
      : creatingItem.kind === 'insumo' ? '/insumos' : '/costos'
    try {
      const { data } = await api.post(endpoint, {
        nombre: creatingItem.nombre.trim(),
        idEmpresa: empresaDestinoId,
      })
      const refetcher = creatingItem.kind === 'labor' ? refetchLabores
        : creatingItem.kind === 'insumo' ? refetchInsumos : refetchCostos
      refetcher()
      creatingItem.onCreated(data.id)
      setCreatingItem(null)
    } catch (e) {
      console.error('create catalog item failed', e)
    }
  }

  // -------------------------------------------------------------------------
  // Permisos / loading
  // -------------------------------------------------------------------------
  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver campañas.</p>
      </div>
    )
  }

  if (!isNew && loadingCampania) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <Loader2 className="size-8 text-primary mb-3 animate-spin" strokeWidth={1.75} />
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando campaña...</p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-5 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/campanias')}
          className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {isNew ? 'Nueva Campaña' : cabecera.nombre || `Campaña #${campaniaId}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isNew
              ? 'Configurá los datos básicos y luego podrás editar los detalles.'
              : 'Cosecha, costos y márgenes por lote.'}
          </p>
        </div>
        {!isNew && (
          <button
            onClick={() => alert('Exportar XLS — pendiente de implementación')}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
            title="Exportar a XLS"
          >
            <FileDown className="size-4" strokeWidth={1.75} />
            <span>Exportar</span>
          </button>
        )}
      </div>

      {/* CABECERA */}
      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Datos de la campaña
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(isNew && isSysAdmin) && (
            <Field label="Empresa destino">
              <select
                value={empresaDestinoId ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  setEmpresaDestinoId(v)
                  setCab('idLote', null)
                }}
                className={inputCls}
              >
                <option value="">Elegí empresa</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </Field>
          )}
          {(!isNew && campania?.lote) && (
            <Field label="Empresa" icon={MapPin}>
              <div className="px-3 py-2 bg-muted/50 border border-border rounded-md text-sm text-foreground">
                {empresas.find((e) => e.id === campania.lote?.idEmpresa)?.nombre
                  || `Empresa #${campania.lote.idEmpresa}`}
              </div>
            </Field>
          )}

          <Field label="Lote" icon={MapPin}>
            <select
              value={cabecera.idLote ?? ''}
              onChange={(e) => setCab('idLote', e.target.value === '' ? null : Number(e.target.value))}
              onBlur={() => saveField('idLote')}
              disabled={!empresaDestinoId || loadingLotes}
              className={inputCls + ' disabled:opacity-60'}
            >
              <option value="">Elegí lote</option>
              {lotesFiltrados.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.descripcion || `Lote #${l.id}`}
                </option>
              ))}
            </select>
            <SaveIndicator status={saveStatus.idLote} />
          </Field>

          <Field label="Nombre campaña" icon={Calendar} colSpan={2}>
            <input
              type="text"
              value={cabecera.nombre}
              onChange={(e) => setCab('nombre', e.target.value)}
              onBlur={() => saveField('nombre')}
              placeholder="Ej: Lote ESTE 2024-25"
              className={inputCls}
            />
            <SaveIndicator status={saveStatus.nombre} />
          </Field>

          <Field label="Año desde">
            <input
              type="number"
              min={1900}
              max={2200}
              value={cabecera.anioDesde}
              onChange={(e) => setCab('anioDesde', Number(e.target.value))}
              onBlur={() => saveField('anioDesde')}
              className={inputCls}
            />
            <SaveIndicator status={saveStatus.anioDesde} />
          </Field>
          <Field label="Año hasta">
            <input
              type="number"
              min={1900}
              max={2200}
              value={cabecera.anioHasta}
              onChange={(e) => setCab('anioHasta', Number(e.target.value))}
              onBlur={() => saveField('anioHasta')}
              className={inputCls}
            />
            <SaveIndicator status={saveStatus.anioHasta} />
          </Field>

          <Field label="Cultivo" icon={Sprout}>
            <select
              value={cabecera.idCultivo ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                setCab('idCultivo', v)
                setCab('idVariedad', null)
              }}
              onBlur={() => saveField('idCultivo')}
              className={inputCls}
            >
              <option value="">Elegí cultivo</option>
              {cultivos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <SaveIndicator status={saveStatus.idCultivo} />
          </Field>

          <Field label="Variedad / Híbrido">
            <select
              value={cabecera.idVariedad ?? ''}
              onChange={(e) => setCab('idVariedad', e.target.value === '' ? null : Number(e.target.value))}
              onBlur={() => saveField('idVariedad')}
              disabled={!cabecera.idCultivo}
              className={inputCls + ' disabled:opacity-60'}
            >
              <option value="">{cabecera.idCultivo ? 'Sin variedad' : 'Elegí cultivo primero'}</option>
              {variedadesFiltradas.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
            <SaveIndicator status={saveStatus.idVariedad} />
          </Field>

          <NumField label="Sup. sembrada (ha)" field="supSembrada" cabecera={cabecera} setCab={setCab} saveField={saveField} status={saveStatus.supSembrada} />
          <NumField label="Sup. cosechada (ha)" field="supCosechada" cabecera={cabecera} setCab={setCab} saveField={saveField} status={saveStatus.supCosechada} />
          <NumField label="Produc. neta total (qq)" field="prodNetaTotalQq" cabecera={cabecera} setCab={setCab} saveField={saveField} status={saveStatus.prodNetaTotalQq} />
          <NumField label="Precio ($/qq)" field="precioXQq" cabecera={cabecera} setCab={setCab} saveField={saveField} status={saveStatus.precioXQq} />
          <NumField label="Alquiler (qq/ha)" field="alquilerQqHa" cabecera={cabecera} setCab={setCab} saveField={saveField} status={saveStatus.alquilerQqHa} />
          <NumField label="Comercialización (%)" field="comercializacionPct" cabecera={cabecera} setCab={setCab} saveField={saveField} status={saveStatus.comercializacionPct} max={100} />
          <NumField label="Cosecha ($/ha)" field="cosechaXHa" cabecera={cabecera} setCab={setCab} saveField={saveField} status={saveStatus.cosechaXHa} />
        </div>

        {isNew && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-border">
            {createError && (
              <p className="text-xs text-destructive">{createError}</p>
            )}
            <button
              onClick={handleCreate}
              disabled={!canCreate || creating}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              <span>{creating ? 'Creando…' : 'Crear campaña'}</span>
            </button>
          </div>
        )}
      </section>

      {/* RESTO (solo si ya hay campaniaId) */}
      {campaniaId !== null && (
        <>
          <DetalleTable
            title="Labores"
            icon={Pickaxe}
            columns={[
              { key: 'idLabor', label: 'Tipo', kind: 'select-with-create' },
              { key: 'fecha', label: 'Fecha', kind: 'date' },
              { key: 'superficieLaboreada', label: 'Sup. laboreada (ha)', kind: 'number', align: 'right' },
              { key: 'costoLaborHa', label: 'Costo labor/ha', kind: 'number', align: 'right' },
              { key: '__ponderado', label: 'Costo ponderado/ha', kind: 'readonly-money', align: 'right' },
            ]}
            rows={labores}
            catalogOptions={catalogLabores}
            addLabel="Agregar labor"
            canAdd={canWrite && catalogLabores.length > 0}
            onAdd={addLabor}
            onChange={updateLabor}
            onRemove={removeLabor}
            onCreateNew={(onCreated) => setCreatingItem({ kind: 'labor', nombre: '', onCreated })}
            computedRow={(l) => costoPonderadoHa(l, parseFloat(cabecera.supSembrada) || 0)}
            emptyHint={catalogLabores.length === 0 ? 'No hay labores disponibles para esta empresa. Creá una primero desde la sección Labores.' : undefined}
          />

          <DetalleTable
            title="Insumos"
            icon={Package}
            columns={[
              { key: 'idInsumo', label: 'Tipo', kind: 'select-with-create' },
              { key: 'unidadesHa', label: 'Unidades/ha', kind: 'number', align: 'right' },
              { key: 'costoUnidad', label: 'Costo/unidad', kind: 'number', align: 'right' },
              { key: '__total', label: 'Costo total', kind: 'readonly-money', align: 'right' },
            ]}
            rows={insumos}
            catalogOptions={catalogInsumos}
            addLabel="Agregar insumo"
            canAdd={canWrite && catalogInsumos.length > 0}
            onAdd={addInsumo}
            onChange={updateInsumo}
            onRemove={removeInsumo}
            onCreateNew={(onCreated) => setCreatingItem({ kind: 'insumo', nombre: '', onCreated })}
            computedRow={(i) => costoTotalInsumoRowHa(i)}
            emptyHint={catalogInsumos.length === 0 ? 'No hay insumos disponibles para esta empresa. Creá uno primero desde la sección Insumos.' : undefined}
          />

          <DetalleTable
            title="Costos varios"
            icon={DollarSign}
            columns={[
              { key: 'idCosto', label: 'Tipo', kind: 'select-with-create' },
              { key: 'unidadesHa', label: 'Unidades/ha', kind: 'number', align: 'right' },
              { key: 'costoUnidad', label: 'Costo/unidad', kind: 'number', align: 'right' },
              { key: '__total', label: 'Costo total', kind: 'readonly-money', align: 'right' },
            ]}
            rows={costos}
            catalogOptions={catalogCostos}
            addLabel="Agregar costo"
            canAdd={canWrite && catalogCostos.length > 0}
            onAdd={addCosto}
            onChange={updateCosto}
            onRemove={removeCosto}
            onCreateNew={(onCreated) => setCreatingItem({ kind: 'costo', nombre: '', onCreated })}
            computedRow={(c) => costoTotalCostoRowHa(c)}
            emptyHint={catalogCostos.length === 0 ? 'No hay costos disponibles para esta empresa. Creá uno primero desde la sección Costos.' : undefined}
          />

          {/* RESULTADOS ECONÓMICOS */}
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-muted/30">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Resultados económicos
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Calculados en el momento a partir de los datos ingresados.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Concepto
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      $/ha
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      $/lote
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <FilaRes label="Ingreso neto" ha={resultados.ingresoNetoHa} lote={resultados.ingresoNetoLote} positive />
                  <FilaRes label="Costo cosecha" ha={resultados.costoCosechaHa} lote={resultados.costoCosechaLote} subtract />
                  <FilaRes label="Costo labores" ha={resultados.costoTotalLaboresHa} lote={resultados.costoTotalLaboresLote} subtract />
                  <FilaRes label="Costo insumos" ha={resultados.costoTotalInsumosHa} lote={resultados.costoTotalInsumosLote} subtract />
                  <FilaRes label="Costos varios" ha={resultados.costoTotalCostosHa} lote={resultados.costoTotalCostosLote} subtract />
                  <FilaRes label="Total de costos directos" ha={resultados.totalCostosDirectosHa} lote={resultados.totalCostosDirectosLote} bold />
                  <FilaRes label="Margen bruto s/ alquiler" ha={resultados.margenBrutoSAlquilerHa} lote={resultados.margenBrutoSAlquilerLote} positive bold />
                  <FilaRes label="Costo de alquiler" ha={resultados.costoAlquilerHa} lote={resultados.costoAlquilerLote} subtract />
                  <FilaRes label="Margen bruto c/ alquiler" ha={resultados.margenBrutoCAlquilerHa} lote={resultados.margenBrutoCAlquilerLote} positive bold />
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/10 flex flex-wrap gap-x-6 gap-y-1.5 text-[11px] text-muted-foreground">
              <span>
                <span className="font-semibold uppercase tracking-wider">Rendimiento:</span>{' '}
                {fmtQQHa(resultados.rendimientoQqHa, 2)}
              </span>
              <span>
                <span className="font-semibold uppercase tracking-wider">Sup. sembrada:</span>{' '}
                {fmtNumero(parseFloat(cabecera.supSembrada) || 0, 2)} ha
              </span>
              <span>
                <span className="font-semibold uppercase tracking-wider">Sup. cosechada:</span>{' '}
                {fmtNumero(parseFloat(cabecera.supCosechada) || 0, 2)} ha
              </span>
            </div>
          </section>
        </>
      )}

      {/* Modal: crear ítem in-situ */}
      {creatingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setCreatingItem(null)} aria-hidden />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">
                Nuevo {creatingItem.kind === 'labor' ? 'labor' : creatingItem.kind === 'insumo' ? 'insumo' : 'costo'}
              </h2>
              <button onClick={() => setCreatingItem(null)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent" aria-label="Cerrar">
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); handleCreateCatalogItem() }}
              className="p-5 space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Nombre</label>
                <input
                  type="text"
                  autoFocus
                  value={creatingItem.nombre}
                  onChange={(e) => setCreatingItem({ ...creatingItem, nombre: e.target.value })}
                  required
                  className={inputCls}
                />
                <p className="text-[11px] text-muted-foreground">
                  Se asignará a la empresa{' '}
                  <span className="font-medium text-foreground">
                    {empresas.find((e) => e.id === empresaDestinoId)?.nombre || 'actual'}
                  </span>.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setCreatingItem(null)} className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent">
                  Cancelar
                </button>
                <button type="submit" disabled={!creatingItem.nombre.trim()} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-componentes de UI
// ---------------------------------------------------------------------------
const inputCls =
  'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

function Field({
  label, children, icon: Icon, colSpan,
}: {
  label: string
  children: React.ReactNode
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
  colSpan?: number
}) {
  return (
    <div className="space-y-1.5" style={colSpan ? { gridColumn: `span ${colSpan}` } : undefined}>
      <label className="text-xs font-medium text-foreground inline-flex items-center gap-1.5">
        {Icon && <Icon className="size-3 text-muted-foreground" strokeWidth={1.75} />}
        {label}
      </label>
      {children}
    </div>
  )
}

function NumField<K extends keyof Cabecera>({
  label, field, cabecera, setCab, saveField, status, max,
}: {
  label: string
  field: K
  cabecera: Cabecera
  setCab: <K2 extends keyof Cabecera>(field: K2, value: Cabecera[K2]) => void
  saveField: (field: keyof Cabecera) => Promise<void>
  status?: SaveStatus
  max?: number
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step="any"
        min={0}
        max={max}
        value={cabecera[field] as string}
        onChange={(e) => setCab(field, e.target.value as Cabecera[K])}
        onBlur={() => saveField(field)}
        placeholder="0"
        className={inputCls + ' text-right tabular-nums'}
      />
      <SaveIndicator status={status} />
    </Field>
  )
}

function SaveIndicator({ status }: { status?: SaveStatus }) {
  if (!status || status === 'idle') return null
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Guardando…
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-success">
        <Check className="size-3" /> Guardado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
      <AlertCircle className="size-3" /> Error
    </span>
  )
}

function FilaRes({
  label, ha, lote, bold, subtract, positive,
}: {
  label: string
  ha: number
  lote: number
  bold?: boolean
  subtract?: boolean
  positive?: boolean
}) {
  const tone = positive
    ? (lote < 0 ? 'text-destructive' : 'text-success')
    : 'text-foreground'
  return (
    <tr className={bold ? 'bg-muted/10' : ''}>
      <td className={`px-4 py-2 ${bold ? 'font-semibold' : 'text-foreground'}`}>
        <span className="inline-flex items-center gap-2">
          {label}
          {subtract && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">resta</span>
          )}
        </span>
      </td>
      <td className={`px-4 py-2 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${tone}`}>
        {fmtMoneda(ha, 0)}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${tone}`}>
        {fmtMoneda(lote, 0)}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Tabla de detalle genérica
// ---------------------------------------------------------------------------
type ColumnDef =
  | { key: string; label: string; kind: 'select-with-create'; align?: 'right' }
  | { key: string; label: string; kind: 'date'; align?: 'right' }
  | { key: string; label: string; kind: 'number'; align?: 'right' }
  | { key: string; label: string; kind: 'readonly-money'; align?: 'right' }

interface DetalleTableProps<T extends { id: number }> {
  title: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  columns: ColumnDef[]
  rows: T[]
  catalogOptions: { id: number; nombre: string }[]
  addLabel: string
  canAdd: boolean
  onAdd: () => void | Promise<void>
  onChange: (id: number, patch: Partial<T>) => void | Promise<void>
  onRemove: (id: number) => void | Promise<void>
  onCreateNew: (onCreated: (id: number) => void) => void
  computedRow: (row: T) => number
  emptyHint?: string
}

function DetalleTable<T extends { id: number }>({
  title, icon: Icon, columns, rows, catalogOptions, addLabel, canAdd,
  onAdd, onChange, onRemove, onCreateNew, computedRow, emptyHint,
}: DetalleTableProps<T>) {
  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider inline-flex items-center gap-2">
          <Icon className="size-4" strokeWidth={1.75} />
          {title}
        </h2>
        {canAdd && (
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="size-3.5" strokeWidth={2} />
            {addLabel}
          </button>
        )}
      </div>

      {emptyHint && rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{emptyHint}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Sin ítems. Usá el botón "{addLabel}" para empezar.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''}`}
                      >
                        {renderCell(c, row, { catalogOptions, onChange, onCreateNew, computedRow })}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => onRemove(row.id)}
                        className="p-1.5 rounded-md text-destructive hover:bg-destructive-soft transition-colors"
                        title="Eliminar"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.75} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

interface CellCtx<T> {
  catalogOptions: { id: number; nombre: string }[]
  onChange: (id: number, patch: Partial<T>) => void | Promise<void>
  onCreateNew: (onCreated: (id: number) => void) => void
  computedRow: (row: T) => number
}

function renderCell<T extends Record<string, unknown> & { id: number }>(
  col: ColumnDef, row: T, ctx: CellCtx<T>
) {
  const cellValue = (key: string): string | number | null => {
    const x = row[key]
    if (x === null || x === undefined) return null
    if (typeof x === 'string' || typeof x === 'number') return x
    return String(x)
  }
  if (col.kind === 'select-with-create') {
    const v = cellValue(col.key)
    return (
      <div className="flex items-center gap-1">
        <select
          value={v ?? ''}
          onChange={(e) => {
            const nv = e.target.value === '' ? null : Number(e.target.value)
            ctx.onChange(row.id, { [col.key]: nv } as Partial<T>)
          }}
          className="flex-1 min-w-0 px-2 py-1 bg-background border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
        >
          <option value="">Elegí…</option>
          {ctx.catalogOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.nombre}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => ctx.onCreateNew((newId) => ctx.onChange(row.id, { [col.key]: newId } as Partial<T>))}
          className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Crear nuevo"
          aria-label="Crear nuevo"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
    )
  }
  if (col.kind === 'date') {
    const v = cellValue(col.key) as string | undefined
    return (
      <input
        type="date"
        value={v ? v.slice(0, 10) : ''}
        onChange={(e) => ctx.onChange(row.id, { [col.key]: e.target.value } as Partial<T>)}
        onBlur={(e) => ctx.onChange(row.id, { [col.key]: e.target.value } as Partial<T>)}
        className="px-2 py-1 bg-background border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
      />
    )
  }
  if (col.kind === 'number') {
    const v = cellValue(col.key) as number | undefined
    return (
      <input
        type="number"
        step="any"
        value={v ?? 0}
        onChange={(e) => ctx.onChange(row.id, { [col.key]: parseFloat(e.target.value) || 0 } as Partial<T>)}
        onBlur={(e) => ctx.onChange(row.id, { [col.key]: parseFloat(e.target.value) || 0 } as Partial<T>)}
        className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
      />
    )
  }
  if (col.kind === 'readonly-money') {
    const v = ctx.computedRow(row)
    return <span className="tabular-nums text-sm text-foreground">{fmtMoneda(v, 0)}</span>
  }
  return null
}
