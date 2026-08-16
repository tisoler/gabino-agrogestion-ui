import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import useSWR from 'swr'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, AlertCircle, Loader2, Save, Check, X, ArrowUpRight,
  Sprout, MapPin, Package, Pickaxe, DollarSign, FileDown, FolderPlus,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { UNIDADES_PRECIO, colorCategoria, colorPrescripcion } from '../constantes'
import NuevoInsumoModal from '../components/NuevoInsumoModal'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { useCotizacionDolar, fmtPrecioInsumo } from '../lib/moneda'
import {
  fmtMoneda, fmtNumero, fmtQQHa, todayLocalISO,
  costoPonderadoHa, costoPonderadoInsumoRowHa, costoTotalCostoRowHa,
  calcularResultados, periodosCampania,
  type Campania, type CampaniaLaborDetalle, type CampaniaInsumoDetalle,
  type CampaniaCostoDetalle, type LaborItem, type InsumoItem, type CostoItem,
  type CategoriaInsumoItem,
} from '../lib/campanias'

// ---------------------------------------------------------------------------
// Tipos auxiliares y fetchers
// ---------------------------------------------------------------------------
interface Lote {
  id: number
  idEmpresa: number
  descripcion: string | null
  idCampo?: number | null
  campo?: { id: number; nombre: string } | null
}
interface Cultivo {
  id: number
  nombre: string
  variedades: { id: number; nombre: string }[]
}

const fetcher = (url: string) => api.get(url).then((r) => r.data)

type Cabecera = {
  campania: string
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
  campania: periodosCampania()[0] || '',
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
  if (next.campania !== saved.campania) payload.campania = next.campania
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

/**
 * Construye el patch para un detalle (labor/insumo/costo) comparando contra
 * la versión guardada. Excluye id, idCampania y los catálogos denormalizados.
 */
function buildDetallePatch<T extends object>(
  current: T,
  saved: T,
): Partial<T> {
  const patch: Record<string, unknown> = {}
  const skip = new Set(['id', 'idCampania', 'labor', 'insumo', 'costo', 'createdAt', 'updatedAt'])
  const c = current as Record<string, unknown>
  const s = saved as Record<string, unknown>
  for (const key of Object.keys(c)) {
    if (skip.has(key)) continue
    if (JSON.stringify(c[key]) !== JSON.stringify(s[key])) {
      patch[key] = c[key]
    }
  }
  return patch as Partial<T>
}

/**
 * Construye el payload completo (con defaults) que se envía tanto en POST
 * como en PATCH. Asegura que los numéricos lleguen como número y los strings
 * como string, con fallback 0 / '' si están vacíos.
 */
function buildLaborPayload(row: {
  idLabor?: number | null
  fecha?: string | null
  superficieLaboreada?: number | null
  costoLaborHa?: number | null
  observaciones?: string | null
}) {
  return {
    idLabor: row.idLabor ?? 0,
    fecha: row.fecha || todayLocalISO(),
    superficieLaboreada: typeof row.superficieLaboreada === 'number' && !Number.isNaN(row.superficieLaboreada)
      ? row.superficieLaboreada
      : 0,
    costoLaborHa: typeof row.costoLaborHa === 'number' && !Number.isNaN(row.costoLaborHa)
      ? row.costoLaborHa
      : 0,
    observaciones: typeof row.observaciones === 'string' && row.observaciones.trim() !== ''
      ? row.observaciones
      : null,
  }
}

function buildInsumoOrCostoPayload(row: {
  idInsumo?: number | null
  idCosto?: number | null
  unidadesHa?: number | null
  costoUnidad?: number | null
  superficieAplicada?: number | null
}) {
  return {
    idInsumo: row.idInsumo ?? 0,
    idCosto: row.idCosto ?? 0,
    unidadesHa: typeof row.unidadesHa === 'number' && !Number.isNaN(row.unidadesHa)
      ? row.unidadesHa
      : 0,
    costoUnidad: typeof row.costoUnidad === 'number' && !Number.isNaN(row.costoUnidad)
      ? row.costoUnidad
      : 0,
    superficieAplicada: typeof row.superficieAplicada === 'number' && !Number.isNaN(row.superficieAplicada)
      ? row.superficieAplicada
      : 0,
  }
}

type DetalleBuilder<T> = (row: T) => Record<string, unknown>

/**
 * Sincroniza una tabla de detalle: hace POST de los nuevos (id < 0),
 * PATCH de los modificados y DELETE de los borrados. Tanto POST como PATCH
 * envían el payload completo (con defaults) para evitar problemas de
 * validación con body parciales.
 */
async function syncDetalle<T extends { id: number; idCampania: number }>(
  campaniaId: number,
  endpoint: 'labores' | 'insumos' | 'costos',
  current: T[],
  saved: T[],
  deletes: Set<number>,
  setCurrent: React.Dispatch<React.SetStateAction<T[]>>,
  setSaved: React.Dispatch<React.SetStateAction<T[]>>,
  setDeletes: React.Dispatch<React.SetStateAction<Set<number>>>,
  buildPayload: DetalleBuilder<T>,
): Promise<void> {
  // Todas las llamadas van contra la relación (no contra el catálogo).
  // POST/PATCH/DELETE: /campanias/:campaniaId/{endpoint}[/:detalleId]
  const base = `/campanias/${campaniaId}/${endpoint}`

  const newRows = current.filter((r) => r.id < 0)
  const savedById = new Map(saved.map((r) => [r.id, r]))
  const dirtyRows = current.filter((r) => {
    if (r.id < 0) return false
    if (deletes.has(r.id)) return false
    const s = savedById.get(r.id)
    if (!s) return false
    return Object.keys(buildDetallePatch(r as unknown as object, s as unknown as object)).length > 0
  })

  // POST: crear filas nuevas en la relación (payload completo con defaults)
  const insertResults = await Promise.all(
    newRows.map(async (row) => {
      const payload = buildPayload(row)
      const { data } = await api.post(base, payload)
      return { tempId: row.id, realId: data.id as number, row: { ...row, id: data.id as number } }
    }),
  )
  if (insertResults.length > 0) {
    const idMap = new Map(insertResults.map((r) => [r.tempId, r.realId]))
    const byTemp = new Map(insertResults.map((r) => [r.tempId, r.row]))
    setCurrent((arr) => arr.map((r) => byTemp.get(r.id) ?? r))
    setSaved((arr) => {
      const filtered = arr.filter((r) => !idMap.has(r.id))
      return [...filtered, ...insertResults.map((r) => r.row)]
    })
  }

  // PATCH: actualizar filas modificadas (payload completo con defaults)
  if (dirtyRows.length > 0) {
    await Promise.all(
      dirtyRows.map((row) => {
        const payload = buildPayload(row)
        return api.patch(`${base}/${row.id}`, payload)
      }),
    )
    setSaved((arr) => {
      const currentIds = new Set(current.map((r) => r.id))
      return arr
        .filter((r) => currentIds.has(r.id) || r.id < 0)
        .map((r) => {
          const c = current.find((x) => x.id === r.id)
          return c ?? r
        })
        .concat(
          insertResults.filter((r) => !arr.some((a) => a.id === r.realId)).map((r) => r.row),
        )
    })
  }

  // DELETE: borrar filas marcadas (de la relación, no del catálogo)
  if (deletes.size > 0) {
    await Promise.all(
      Array.from(deletes).map((id) => api.delete(`${base}/${id}`).catch(() => undefined)),
    )
    setDeletes(new Set())
  }

  // Normalización final: el snapshot guardado queda espejado con el estado
  // actual (current) + las filas recién insertadas (insertResults), sin ids
  // temporales. Esto garantiza que un delete se vea reflejado y que la
  // próxima corrida del debounce no vuelva a "ver" como dirty algo que ya
  // está sincronizado.
  setSaved([
    ...current.filter((r) => r.id > 0),
    ...insertResults
      .map((r) => r.row)
      .filter((r) => !current.some((c) => c.id === r.id)),
  ])
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function CampaniaDetalle() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const isNew = !params.id || params.id === 'nueva'

  const { permisos, isSysAdmin, isAsesorAdmin, currentEmpresaId, empresas } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const canManageCategorias = isSysAdmin || isAsesorAdmin
  const canWrite = permisos.includes('escritura:campania')
  const canRead = permisos.includes('lectura:campania')

  const [empresaDestinoId, setEmpresaDestinoId] = useState<number | null>(
    isNew ? (isAdmin ? null : currentEmpresaId) : null
  )
  // Campo: filtra el selector de lotes (no se persiste en la campaña).
  const [idCampo, setIdCampo] = useState<number | ''>('')

  // El costo/unidad de insumos se guarda en USD y se muestra siempre en pesos
  // usando el dólar venta (sin toggle de moneda en estas vistas).
  const { venta: dolarVenta } = useCotizacionDolar()

  const [cabecera, setCabecera] = useState<Cabecera>(emptyCabecera)
  const [cabeceraSaved, setCabeceraSaved] = useState<Cabecera>(emptyCabecera)
  const [campaniaId, setCampaniaId] = useState<number | null>(isNew ? null : Number(params.id))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [labores, setLabores] = useState<CampaniaLaborDetalle[]>([])
  const [laboresSaved, setLaboresSaved] = useState<CampaniaLaborDetalle[]>([])
  const [insumos, setInsumos] = useState<CampaniaInsumoDetalle[]>([])
  const [insumosSaved, setInsumosSaved] = useState<CampaniaInsumoDetalle[]>([])
  const [costos, setCostos] = useState<CampaniaCostoDetalle[]>([])
  const [costosSaved, setCostosSaved] = useState<CampaniaCostoDetalle[]>([])

  // Filas marcadas para borrar pero todavía presentes en el servidor
  const [pendingLaborDeletes, setPendingLaborDeletes] = useState<Set<number>>(new Set())
  const [pendingInsumoDeletes, setPendingInsumoDeletes] = useState<Set<number>>(new Set())
  const [pendingCostoDeletes, setPendingCostoDeletes] = useState<Set<number>>(new Set())

  // Estado del guardado batch
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Contador que se incrementa en cada cambio. El useEffect del debounce
  // depende de él, así que cualquier edición resetea el timer de 3s.
  const [dirtyVersion, setDirtyVersion] = useState(0)
  const bumpDirty = useCallback(() => setDirtyVersion((v) => v + 1), [])

  // Contador de IDs temporales para filas nuevas
  const tempIdCounter = useRef(0)
  const newTempId = () => -++tempIdCounter.current

  // Catálogos
  // - sys-admin / asesor-admin: cultivos con all=true (globales + empresas),
  //   lotes de todas las empresas (se filtran por empresa destino abajo).
  // - asesor / productor: cultivos globales + empresa seleccionada, y lotes
  //   de la empresa seleccionada.
  const { data: lotes = [], isLoading: loadingLotes } = useSWR<Lote[]>(
    canRead ? ['/lotes', empresaDestinoId] : null,
    ([url, empresaId]: [string, number | null]) =>
      api.get(url, { params: empresaId ? { currentEmpresaId: empresaId } : undefined }).then((r) => r.data)
  )
  const { data: cultivos = [] } = useSWR<Cultivo[]>(
    canRead ? ['/cultivos', isAdmin, empresaDestinoId] : null,
    ([url, all, empresaId]: [string, boolean, number | null]) => {
      const params: Record<string, unknown> = {}
      if (all) params.all = true
      else if (empresaId) params.currentEmpresaId = empresaId
      return api.get(url, { params }).then((r) => r.data)
    }
  )

  const catalogParams = useMemo(() => {
    const p: Record<string, unknown> = {
      soloActivos: true,
    }
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
  const { data: catalogCategorias = [], mutate: refetchCategorias } = useSWR<CategoriaInsumoItem[]>(
    canRead && campaniaId !== null ? '/categorias' : null,
    fetcher
  )

  // Campaña existente
  //
  // `revalidateOnFocus: false` es importante: la vista es dueña del estado
  // local (cabecera, detalles, pendingDeletes, etc.) y SWR re-valida en foco
  // por defecto. Cada re-validación entrega un objeto `campania` nuevo y, sin
  // este flag, el useEffect de abajo re-sincronizaría TODO el state desde
  // el servidor — pisando los deletes pendientes, las ediciones sin guardar
  // y haciendo que la fila borrada "vuelva".
  const { data: campania, isLoading: loadingCampania } = useSWR<Campania>(
    canRead && !isNew ? `/campanias/${params.id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // Además del flag de SWR, el effect de abajo se protege con un ref para
  // que una re-validación posterior (por ejemplo, después de un PATCH
  // exitoso que devolvió la campaña) no pise el state local.
  const loadedCampaniaIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!campania) return
    // Sólo sincronizamos el state local la primera vez que llega la campaña
    // para esta id, o si el usuario navegó a una campaña distinta. Si no,
    // cualquier re-validación de SWR (que crea un objeto `campania` nuevo)
    // pisaría los edits y deletes pendientes.
    if (loadedCampaniaIdRef.current === campania.id) return
    loadedCampaniaIdRef.current = campania.id

    setCampaniaId(campania.id)
    const next: Cabecera = {
      campania: campania.campania,
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
    const initialLabores = campania.labores || []
    const initialInsumos = campania.insumos || []
    const initialCostos = campania.costos || []
    setLabores(initialLabores)
    setLaboresSaved(initialLabores)
    setInsumos(initialInsumos)
    setInsumosSaved(initialInsumos)
    setCostos(initialCostos)
    setCostosSaved(initialCostos)
    setPendingLaborDeletes(new Set())
    setPendingInsumoDeletes(new Set())
    setPendingCostoDeletes(new Set())
    if (campania.lote) {
      setEmpresaDestinoId(campania.lote.idEmpresa)
      setIdCampo(campania.lote.campo ? campania.lote.campo.id : 0)
    }
  }, [campania])

  // Lotes del productor; la lista de campos la filtra el productor y el campo
  // seleccionado filtra la lista de lotes.
  const lotesDeProductor = useMemo(() => {
    if (!empresaDestinoId) return []
    return lotes.filter((l) => l.idEmpresa === empresaDestinoId)
  }, [lotes, empresaDestinoId])

  const camposDisponibles = useMemo(() => {
    const seen = new Map<number, string>()
    let sinCampo = false
    for (const l of lotesDeProductor) {
      if (l.campo) seen.set(l.campo.id, l.campo.nombre)
      else sinCampo = true
    }
    const opciones = Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([value, label]) => ({ value, label }))
    if (sinCampo) opciones.push({ value: 0, label: 'Sin campo' })
    return opciones
  }, [lotesDeProductor])

  const lotesFiltrados = useMemo(() => {
    if (idCampo === '') return lotesDeProductor
    const target = idCampo === 0 ? null : Number(idCampo)
    return lotesDeProductor.filter((l) => (l.idCampo ?? null) === target)
  }, [lotesDeProductor, idCampo])

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

  // Prescripciones presentes en la producción: dan el color de agrupación de
  // las filas de labor e insumo que las originaron.
  const prescripcionIds = useMemo(() => {
    const ids: number[] = []
    for (const l of labores) if (l.idPrescripcion != null) ids.push(l.idPrescripcion)
    for (const i of insumos) if (i.idPrescripcion != null) ids.push(i.idPrescripcion)
    return ids
  }, [labores, insumos])

  // Aviso de warning cuando falta la sup. sembrada (los costos ponderados se
  // calculan dividiendo por ella).
  const avisoSupSembrada = !parseFloat(cabecera.supSembrada) ? (
    <div className="flex items-center gap-2 bg-warning-soft border-t border-warning/30 text-warning-foreground px-4 py-2.5 text-xs">
      <AlertCircle className="size-3.5 shrink-0" strokeWidth={2} />
      <span>
        Para calcular los costos ponderados, ingresá la <span className="font-semibold">sup. sembrada</span> en la cabecera.
      </span>
    </div>
  ) : undefined

  // Modal: crear ítem in-situ de catálogo
  const [creatingItem, setCreatingItem] = useState<{
    kind: 'labor' | 'insumo' | 'costo'
    nombre: string
    descripcion: string
    categoriaId: number | null
    unidad: string
    precioUnitario: string
    idEmpresa: number | null
    onCreated: (id: number) => void
  } | null>(null)
  const [creatingItemError, setCreatingItemError] = useState<string | null>(null)
  const [creatingItemBusy, setCreatingItemBusy] = useState(false)

  // Modal compartido de "Nuevo insumo"
  const [nuevoInsumoOpen, setNuevoInsumoOpen] = useState(false)
  const nuevoInsumoRowIdRef = useRef<number | null>(null)
  const [creatingCategoriaOpen, setCreatingCategoriaOpen] = useState(false)
  const [creatingCategoriaNombre, setCreatingCategoriaNombre] = useState('')
  const [creatingCategoriaBusy, setCreatingCategoriaBusy] = useState(false)
  const [creatingCategoriaError, setCreatingCategoriaError] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // Crear campaña (al click inicial cuando es nueva)
  // -------------------------------------------------------------------------
  const canCreate = useMemo(() => {
    return (
      cabecera.idLote !== null &&
      cabecera.idCultivo !== null &&
      cabecera.campania !== ''
    )
  }, [cabecera])

  const handleCreate = async () => {
    if (!canCreate || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const payload: Record<string, unknown> = {
        campania: cabecera.campania,
        idLote: cabecera.idLote,
        idCultivo: cabecera.idCultivo,
      }
      if (empresaDestinoId) payload.idEmpresa = empresaDestinoId
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
      setCreateError(e?.response?.data?.message || 'Error al crear la producción')
    } finally {
      setCreating(false)
    }
  }

  // -------------------------------------------------------------------------
  // Setters de cabecera: sólo actualizan estado local, sin PATCH.
  // El guardado se hace en batch desde save().
  // -------------------------------------------------------------------------
  const setCab = <K extends keyof Cabecera>(field: K, value: Cabecera[K]) => {
    setCabecera((c) => ({ ...c, [field]: value }))
    bumpDirty()
  }

  // -------------------------------------------------------------------------
  // Acciones sobre detalles: sin API, sólo estado local. El guardado se
  // hace en batch desde save().
  // -------------------------------------------------------------------------
  const addLabor = () => {
    if (!campaniaId || catalogLabores.length === 0) return
    const tempId = newTempId()
    const newRow: CampaniaLaborDetalle = {
      id: tempId,
      idCampania: campaniaId,
      idLabor: null,
      fecha: todayLocalISO(),
      superficieLaboreada: 0,
      costoLaborHa: 0,
    }
    setLabores((arr) => [...arr, newRow])
    bumpDirty()
  }

  const updateLabor = (id: number, patch: Partial<CampaniaLaborDetalle>) => {
    setLabores((arr) => arr.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    bumpDirty()
  }

  const removeLabor = (id: number) => {
    if (!confirm('¿Eliminar esta labor?')) return
    setLabores((arr) => arr.filter((l) => l.id !== id))
    // Sólo marcar para DELETE si ya está en el servidor (id real)
    if (id > 0) {
      setPendingLaborDeletes((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
      // Sacarla también del snapshot guardado, ya no la esperamos
      setLaboresSaved((arr) => arr.filter((l) => l.id !== id))
    }
    bumpDirty()
  }

  const addInsumo = () => {
    if (!campaniaId || catalogInsumos.length === 0) return
    const tempId = newTempId()
    const newRow: CampaniaInsumoDetalle = {
      id: tempId,
      idCampania: campaniaId,
      idInsumo: null,
      unidadesHa: 0,
      costoUnidad: 0,
      superficieAplicada: 0,
    }
    setInsumos((arr) => [...arr, newRow])
    bumpDirty()
  }

  const updateInsumo = (id: number, patch: Partial<CampaniaInsumoDetalle>) => {
    setInsumos((arr) => arr.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    bumpDirty()
  }

  const removeInsumo = (id: number) => {
    if (!confirm('¿Eliminar este insumo?')) return
    setInsumos((arr) => arr.filter((i) => i.id !== id))
    if (id > 0) {
      setPendingInsumoDeletes((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
      setInsumosSaved((arr) => arr.filter((i) => i.id !== id))
    }
    bumpDirty()
  }

  const addCosto = () => {
    if (!campaniaId || catalogCostos.length === 0) return
    const tempId = newTempId()
    const newRow: CampaniaCostoDetalle = {
      id: tempId,
      idCampania: campaniaId,
      idCosto: null,
      unidadesHa: 0,
      costoUnidad: 0,
    }
    setCostos((arr) => [...arr, newRow])
    bumpDirty()
  }

  const updateCosto = (id: number, patch: Partial<CampaniaCostoDetalle>) => {
    setCostos((arr) => arr.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    bumpDirty()
  }

  const removeCosto = (id: number) => {
    if (!confirm('¿Eliminar este costo?')) return
    setCostos((arr) => arr.filter((c) => c.id !== id))
    if (id > 0) {
      setPendingCostoDeletes((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
      setCostosSaved((arr) => arr.filter((c) => c.id !== id))
    }
    bumpDirty()
  }

  // -------------------------------------------------------------------------
  // Dirty detection
  // -------------------------------------------------------------------------
  const isCabeceraDirty = useCallback((): boolean => {
    for (const k of numericFields) {
      const a = parseFloat(cabecera[k] as string) || 0
      const b = parseFloat(cabeceraSaved[k] as string) || 0
      if (a !== b) return true
    }
    if (cabecera.campania !== cabeceraSaved.campania) return true
    if (cabecera.idLote !== cabeceraSaved.idLote) return true
    if (cabecera.idCultivo !== cabeceraSaved.idCultivo) return true
    if (cabecera.idVariedad !== cabeceraSaved.idVariedad) return true
    return false
  }, [cabecera, cabeceraSaved])

  const hasDirtyDetalleRows = useCallback(
    <T extends { id: number }>(current: T[], saved: T[]): boolean => {
      if (current.some((r) => r.id < 0)) return true
      const savedById = new Map(saved.map((r) => [r.id, r]))
      for (const row of current) {
        if (row.id < 0) return true
        const s = savedById.get(row.id)
        if (!s) return true
        const rowAny = row as unknown as Record<string, unknown>
        const savedAny = s as unknown as Record<string, unknown>
        for (const k of Object.keys(rowAny)) {
          if (k === 'id' || k === 'idCampania' || k === 'labor' || k === 'insumo' || k === 'costo') continue
          if (JSON.stringify(rowAny[k]) !== JSON.stringify(savedAny[k])) return true
        }
      }
      return false
    },
    [],
  )

  const hasChanges = useMemo(() => {
    if (!campaniaId) return false
    if (isCabeceraDirty()) return true
    if (hasDirtyDetalleRows(labores, laboresSaved)) return true
    if (hasDirtyDetalleRows(insumos, insumosSaved)) return true
    if (hasDirtyDetalleRows(costos, costosSaved)) return true
    if (pendingLaborDeletes.size > 0) return true
    if (pendingInsumoDeletes.size > 0) return true
    if (pendingCostoDeletes.size > 0) return true
    return false
  }, [campaniaId, isCabeceraDirty, hasDirtyDetalleRows, labores, laboresSaved, insumos, insumosSaved, costos, costosSaved, pendingLaborDeletes, pendingInsumoDeletes, pendingCostoDeletes])

  // -------------------------------------------------------------------------
  // Guardado batch
  // -------------------------------------------------------------------------
  /**
   * Realiza el guardado completo: cabecera + inserts/updates/deletes de
   * cada detalle. Devuelve true si algo se guardó.
   */
  const save = useCallback(async (): Promise<boolean> => {
    if (!campaniaId || isSaving) return false
    if (!hasChanges) return false

    // Las filas nuevas arrancan sin tipo (muestran "Elegí…"); no se pueden
    // guardar hasta elegir el ítem.
    const incompletas = [
      ...(labores.some((r) => r.idLabor == null) ? ['labores'] : []),
      ...(insumos.some((r) => r.idInsumo == null) ? ['insumos'] : []),
      ...(costos.some((r) => r.idCosto == null) ? ['costos'] : []),
    ]
    if (incompletas.length > 0) {
      setSaveError(`Completá el tipo en las filas de: ${incompletas.join(', ')}`)
      return false
    }

    setIsSaving(true)
    setSaveError(null)
    try {
      // 1) Cabecera
      if (isCabeceraDirty()) {
        const payload = buildPatchPayload(cabecera, cabeceraSaved)
        if (Object.keys(payload).length > 0) {
          const { data } = await api.patch(`/campanias/${campaniaId}`, payload)
          setCabeceraSaved(cabecera)
          if (payload.idLote && data?.lote) {
            setEmpresaDestinoId(data.lote.idEmpresa)
            refetchLabores(); refetchInsumos(); refetchCostos()
          }
        }
      }

      // 2) Labores: inserts, updates y deletes en paralelo
      await syncDetalle(
        campaniaId,
        'labores',
        labores, laboresSaved, pendingLaborDeletes,
        setLabores, setLaboresSaved, setPendingLaborDeletes,
        buildLaborPayload,
      )
      // 3) Insumos
      await syncDetalle(
        campaniaId,
        'insumos',
        insumos, insumosSaved, pendingInsumoDeletes,
        setInsumos, setInsumosSaved, setPendingInsumoDeletes,
        buildInsumoOrCostoPayload,
      )
      // 4) Costos
      await syncDetalle(
        campaniaId,
        'costos',
        costos, costosSaved, pendingCostoDeletes,
        setCostos, setCostosSaved, setPendingCostoDeletes,
        buildInsumoOrCostoPayload,
      )

      return true
    } catch (e) {
      console.error('save failed', e)
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setSaveError(
        Array.isArray(msg) ? msg.join(', ')
          : typeof msg === 'string' ? msg
            : 'Error al guardar. Reintentá en unos segundos.',
      )
      return false
    } finally {
      setIsSaving(false)
    }
  }, [
    campaniaId, isSaving, hasChanges, isCabeceraDirty,
    cabecera, cabeceraSaved,
    labores, laboresSaved, pendingLaborDeletes,
    insumos, insumosSaved, pendingInsumoDeletes,
    costos, costosSaved, pendingCostoDeletes,
    refetchLabores, refetchInsumos, refetchCostos,
  ])

  // Ref siempre apunta a la última versión de save (para el effect de debounce)
  const saveRef = useRef(save)
  saveRef.current = save

  // Descarga el .xls de la campaña desde el backend.
  const handleExport = useCallback(async () => {
    if (!campaniaId || isExporting) return
    setIsExporting(true)
    try {
      const res = await api.get(`/campanias/${campaniaId}/export`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(res.data)
      const a = document.createElement('a')
      const header = res.headers?.['content-disposition'] as string | undefined
      const match = header ? /filename="?([^";]+)"?/.exec(header) : null
      a.href = url
      a.download = match?.[1] || `export-campania-${campaniaId}.xls`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error al exportar', err)
    } finally {
      setIsExporting(false)
    }
  }, [campaniaId, isExporting])

  // Cada vez que hay un cambio, dirtyVersion se incrementa arriba. El
  // useEffect de abajo arma un setTimeout de 3s; si llega otro cambio
  // antes, se cancela y se vuelve a armar. Así el guardado se dispara 3s
  // después del ÚLTIMO cambio, no del primero.

  // Debounce del autoguardado
  useEffect(() => {
    if (!campaniaId) return
    if (dirtyVersion === 0) return
    const timer = setTimeout(() => {
      saveRef.current()
    }, 3000)
    return () => clearTimeout(timer)
  }, [campaniaId, dirtyVersion])

  const handleCreateCatalogItem = async () => {
    if (!creatingItem || !creatingItem.nombre.trim() || !empresaDestinoId) return
    if (creatingItem.kind === 'insumo' && !creatingItem.categoriaId) return
    const endpoint = creatingItem.kind === 'labor' ? '/labores'
      : creatingItem.kind === 'insumo' ? '/insumos' : '/costos'
    setCreatingItemBusy(true)
    setCreatingItemError(null)
    try {
      const payload: Record<string, unknown> = {
        nombre: creatingItem.nombre.trim(),
        idEmpresa: isAdmin ? creatingItem.idEmpresa : empresaDestinoId,
      }
      if (creatingItem.descripcion.trim() !== '') payload.descripcion = creatingItem.descripcion.trim()
      if (creatingItem.precioUnitario.trim() !== '') payload.precioUnitario = parseFloat(creatingItem.precioUnitario)
      if (creatingItem.kind === 'insumo') payload.idCategoria = creatingItem.categoriaId
      if (creatingItem.kind !== 'labor' && creatingItem.unidad.trim() !== '') payload.unidad = creatingItem.unidad.trim()
      const { data } = await api.post(endpoint, payload)
      const refetcher = creatingItem.kind === 'labor' ? refetchLabores
        : creatingItem.kind === 'insumo' ? refetchInsumos : refetchCostos
      refetcher()
      creatingItem.onCreated(data.id)
      setCreatingItem(null)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setCreatingItemError(
        Array.isArray(msg) ? msg.join(', ') :
          typeof msg === 'string' ? msg :
            'No se pudo crear el ítem.'
      )
    } finally {
      setCreatingItemBusy(false)
    }
  }

  const handleCreateCategoria = async () => {
    if (!creatingCategoriaNombre.trim() || creatingCategoriaBusy) return
    setCreatingCategoriaBusy(true)
    setCreatingCategoriaError(null)
    try {
      const { data } = await api.post('/categorias', {
        nombre: creatingCategoriaNombre.trim(),
      })
      setCreatingItem({ ...creatingItem!, categoriaId: data.id })
      setCreatingCategoriaNombre('')
      setCreatingCategoriaOpen(false)
      refetchCategorias()
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setCreatingCategoriaError(
        Array.isArray(msg) ? msg.join(', ') :
          typeof msg === 'string' ? msg :
            'No se pudo crear la categoría.'
      )
    } finally {
      setCreatingCategoriaBusy(false)
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
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver producción.</p>
      </div>
    )
  }

  if (!isNew && loadingCampania) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <Loader2 className="size-8 text-primary mb-3 animate-spin" strokeWidth={1.75} />
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando producción...</p>
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
          className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {isNew ? 'Nueva producción' : `Producción #${campaniaId}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isNew
              ? 'Configurá los datos básicos y luego podrás editar los detalles.'
              : 'Cosecha, costos y márgenes por lote.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isNew && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Exportar a XLS"
            >
              {isExporting ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <FileDown className="size-4" strokeWidth={1.75} />
              )}
              <span>Exportar</span>
            </button>
          )}
          {campaniaId !== null && (
            <SaveButton
              isSaving={isSaving}
              hasChanges={hasChanges}
              onClick={save}
            />
          )}
        </div>
      </div>

      {saveError && (
        <div className="bg-destructive-soft border border-destructive/30 text-destructive rounded-md px-4 py-2 text-sm flex items-center gap-2">
          <AlertCircle className="size-4" strokeWidth={1.75} />
          {saveError}
        </div>
      )}

      {/* CABECERA */}
      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Datos de la producción
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isNew && (
            <Field label="Productor destino">
              <SelectAutocomplete
                value={empresaDestinoId ?? ''}
                onChange={(v) => {
                  setEmpresaDestinoId(Number(v))
                  setIdCampo('')
                  setCab('idLote', null)
                }}
                options={empresas.map((e) => ({ value: e.id, label: e.nombre }))}
                placeholder="Elegí productor"
              />
            </Field>
          )}
          {(!isNew && campania?.lote) && (
            <Field label="Productor" icon={MapPin}>
              <div className="px-3 py-2 bg-muted/50 border border-border rounded-md text-sm text-foreground">
                {empresas.find((e) => e.id === campania.lote?.idEmpresa)?.nombre
                  || `Productor #${campania.lote.idEmpresa}`}
              </div>
            </Field>
          )}

          <Field label="Campaña">
            <SelectAutocomplete
              value={cabecera.campania}
              onChange={(v) => setCab('campania', String(v))}
              options={periodosCampania().map((p) => ({ value: p, label: p }))}
              placeholder="Seleccionar período..."
              sort={{ by: 'alfabetico', direction: 'desc' }}
            />
          </Field>

          <Field label="Campo" icon={MapPin}>
            <SelectAutocomplete
              value={idCampo}
              onChange={(v) => {
                setIdCampo(v === '' ? '' : Number(v))
                setCab('idLote', null)
              }}
              options={camposDisponibles.map((c) => ({ value: c.value, label: c.label }))}
              placeholder="Todos los campos"
              disabled={!empresaDestinoId || loadingLotes}
              clearable
            />
          </Field>

          <Field label="Lote" icon={MapPin}>
            <SelectAutocomplete
              value={cabecera.idLote ?? ''}
              onChange={(v) => setCab('idLote', v === '' ? null : Number(v))}
              options={lotesFiltrados.map((l) => ({ value: l.id, label: l.descripcion || `Lote #${l.id}` }))}
              placeholder="Elegí lote"
              disabled={!empresaDestinoId || loadingLotes}
            />
          </Field>

          <Field label="Cultivo" icon={Sprout}>
            <SelectAutocomplete
              value={cabecera.idCultivo ?? ''}
              onChange={(v) => {
                setCab('idCultivo', v === '' ? null : Number(v))
                setCab('idVariedad', null)
              }}
              options={cultivos.map((c) => ({ value: c.id, label: c.nombre }))}
              placeholder="Elegí cultivo"
            />
          </Field>

          <Field label="Variedad / Híbrido">
            <SelectAutocomplete
              value={cabecera.idVariedad ?? ''}
              onChange={(v) => setCab('idVariedad', v === '' ? null : Number(v))}
              options={[
                { value: '', label: 'Sin variedad' },
                ...variedadesFiltradas.map((v) => ({ value: v.id, label: v.nombre })),
              ]}
              placeholder={cabecera.idCultivo ? 'Sin variedad' : 'Elegí cultivo primero'}
              disabled={!cabecera.idCultivo}
            />
          </Field>

          <NumField label="Sup. sembrada (ha)" field="supSembrada" cabecera={cabecera} setCab={setCab} />
          <NumField label="Sup. cosechada (ha)" field="supCosechada" cabecera={cabecera} setCab={setCab} />
          <NumField label="Produc. neta total (qq)" field="prodNetaTotalQq" cabecera={cabecera} setCab={setCab} />
          <NumField label="Precio ($/qq)" field="precioXQq" cabecera={cabecera} setCab={setCab} />
          <NumField label="Alquiler (qq/ha)" field="alquilerQqHa" cabecera={cabecera} setCab={setCab} />
          <NumField label="Comercialización (%)" field="comercializacionPct" cabecera={cabecera} setCab={setCab} max={100} />
          <NumField label="Cosecha ($/ha)" field="cosechaXHa" cabecera={cabecera} setCab={setCab} />
        </div>

        {isNew && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-border">
            {createError && (
              <p className="text-xs text-destructive">{createError}</p>
            )}
            <button
              onClick={handleCreate}
              disabled={!canCreate || creating}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              <span>{creating ? 'Creando…' : 'Crear producción'}</span>
            </button>
          </div>
        )}
      </section>

      {/* RESTO (solo si ya hay campaniaId) */}
      {campaniaId !== null && (
        <>
          {/* Rendimiento (qq/ha) destacado entre los inputs y la tabla de Labores.
              Misma fórmula que el footer de Resultados económicos; se duplica
              acá para que quede a la vista mientras se cargan las labores. */}
          <section className="bg-card border border-border rounded-lg p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Sprout className="size-4 text-primary" strokeWidth={1.75} />
              <span className="text-[16px] font-semibold tracking-wider text-muted-foreground">
                Rendimiento (qq/ha)
              </span>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-foreground tabular-nums">
                {fmtNumero(resultados.rendimientoQqHa, 2)}
                <span className="text-sm text-muted-foreground font-normal ml-1">qq/ha</span>
              </p>
              {resultados.rendimientoQqHa === 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Ingresá producción neta y superficie cosechada para calcularlo
                </p>
              )}
            </div>
          </section>

          <DetalleTable
            title="Labores"
            icon={Pickaxe}
            columns={[
              { key: 'idLabor', label: 'Labor', kind: 'select-with-create', preloadField: 'costoLaborHa' },
              { key: 'fecha', label: 'Fecha', kind: 'date' },
              { key: 'superficieLaboreada', label: 'Sup. laboreada (ha)', kind: 'number', align: 'right' },
              { key: 'costoLaborHa', label: 'Costo labor/ha', kind: 'number', align: 'right' },
              { key: 'observaciones', label: 'Observaciones', kind: 'text' },
              { key: '__ponderado', label: 'Costo ponderado/ha', kind: 'readonly-money', align: 'right' },
            ]}
            rows={labores}
            catalogOptions={catalogLabores}
            addLabel="Agregar labor"
            canAdd={canWrite && catalogLabores.length > 0}
            onAdd={addLabor}
            onChange={updateLabor}
            onRemove={removeLabor}
            onCreateNew={(_row, onCreated) => setCreatingItem({ kind: 'labor', nombre: '', descripcion: '', categoriaId: null, unidad: '', precioUnitario: '', idEmpresa: null, onCreated })}
            computedRow={(l) => costoPonderadoHa(l, parseFloat(cabecera.supSembrada) || 0)}
            totalLabel="Costo total de labores"
            totalValue={resultados.costoTotalLaboresHa}
            rowBgOf={(row) => colorPrescripcion((row as { idPrescripcion?: number | null }).idPrescripcion, prescripcionIds)}
            prescripcionIdOf={(row) => (row as { idPrescripcion?: number | null }).idPrescripcion ?? null}
            emptyHint={catalogLabores.length === 0 ? 'No hay labores disponibles para este productor. Creá una primero desde la sección Labores.' : undefined}
            footer={avisoSupSembrada}
          />

          <DetalleTable
            title="Insumos"
            icon={Package}
            dolar={dolarVenta}
            totalUsd
            optionTag={(o) => o.categoria ? (
              <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorCategoria(o.idCategoria, catalogCategorias)}`}>
                {o.categoria.nombre}
              </span>
            ) : null}
            columns={[
              { key: 'idInsumo', label: 'Insumo', kind: 'select-with-create', preloadField: 'costoUnidad' },
              { key: 'superficieAplicada', label: 'Sup. aplicada (ha)', kind: 'number', align: 'right' },
              { key: 'unidadesHa', label: 'Unidades/ha', kind: 'number', align: 'right', precision: 3 },
              { key: 'costoUnidad', label: 'Costo/unidad', kind: 'precio-insumo', align: 'right' },
              { key: '__ponderado', label: 'Costo ponderado/ha', kind: 'readonly-money', align: 'right' },
            ]}
            rows={insumos}
            catalogOptions={catalogInsumos}
            addLabel="Agregar insumo"
            canAdd={canWrite && catalogInsumos.length > 0}
            onAdd={addInsumo}
            onChange={updateInsumo}
            onRemove={removeInsumo}
            onCreateNew={(row) => { nuevoInsumoRowIdRef.current = row.id; setNuevoInsumoOpen(true) }}
            computedRow={(i) => costoPonderadoInsumoRowHa(i, parseFloat(cabecera.supSembrada) || 0)}
            totalLabel="Costo total de insumos"
            totalValue={resultados.costoTotalInsumosHa}
            rowBgOf={(row) => colorPrescripcion((row as { idPrescripcion?: number | null }).idPrescripcion, prescripcionIds)}
            prescripcionIdOf={(row) => (row as { idPrescripcion?: number | null }).idPrescripcion ?? null}
            emptyHint={catalogInsumos.length === 0 ? 'No hay insumos disponibles para este productor. Creá uno primero desde la sección Insumos.' : undefined}
            footer={avisoSupSembrada}
          />

          <DetalleTable
            title="Costos varios"
            icon={DollarSign}
            columns={[
              { key: 'idCosto', label: 'Costo', kind: 'select-with-create', preloadField: 'costoUnidad' },
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
            onCreateNew={(_row, onCreated) => setCreatingItem({ kind: 'costo', nombre: '', descripcion: '', categoriaId: null, unidad: '', precioUnitario: '', idEmpresa: null, onCreated })}
            computedRow={(c) => costoTotalCostoRowHa(c)}
            totalLabel="Costo total de costos varios"
            totalValue={resultados.costoTotalCostosHa}
            emptyHint={catalogCostos.length === 0 ? 'No hay costos disponibles para este productor. Creá uno primero desde la sección Costos.' : undefined}
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
                <span className="font-semibold uppercase tracking-wider">Rendimiento (qq/ha):</span>{' '}
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
            {avisoSupSembrada}
          </section>

          {/* Botón Guardar al pie */}
          <div className="flex justify-end pt-2">
            <SaveButton isSaving={isSaving} hasChanges={hasChanges} onClick={save} />
          </div>
        </>
      )}

      {/* Modal: nuevo insumo (compartido) */}
      {nuevoInsumoOpen && (
        <NuevoInsumoModal
          empresaId={empresaDestinoId}
          empresaNombre={empresas.find((e) => e.id === empresaDestinoId)?.nombre}
          isAdmin={isAdmin}
          onCreated={(insumo) => {
            if (nuevoInsumoRowIdRef.current != null) {
              updateInsumo(nuevoInsumoRowIdRef.current, {
                idInsumo: insumo.id,
                costoUnidad: insumo.precioUnitario ?? 0,
              })
            }
            nuevoInsumoRowIdRef.current = null
            // Agrega el nuevo insumo al catálogo de forma optimista para que
            // quede seleccionado en la fila al instante (luego revalida).
            refetchInsumos(
              (prev: InsumoItem[] | undefined) => {
                const lista = Array.isArray(prev) ? prev : []
                if (lista.some((i) => i.id === insumo.id)) return lista
                return [...lista, { id: insumo.id, nombre: insumo.nombre, idEmpresa: insumo.idEmpresa ?? null, precioUnitario: insumo.precioUnitario ?? null }]
              },
            )
            setNuevoInsumoOpen(false)
          }}
          onClose={() => {
            nuevoInsumoRowIdRef.current = null
            setNuevoInsumoOpen(false)
          }}
        />
      )}

      {/* Modal: crear ítem in-situ */}
      {creatingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => { setCreatingItem(null); setCreatingItemError(null) }} aria-hidden />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">
                Nuevo {creatingItem.kind === 'labor' ? 'labor' : creatingItem.kind === 'insumo' ? 'insumo' : 'costo'}
              </h2>
              <button onClick={() => { setCreatingItem(null); setCreatingItemError(null) }} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent cursor-pointer" aria-label="Cerrar">
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
                  onChange={(e) => { setCreatingItem({ ...creatingItem, nombre: e.target.value }); setCreatingItemError(null) }}
                  required
                  className={inputCls}
                />
                <div className="pt-1 space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Productor</label>
                  <SelectAutocomplete
                    value={isAdmin ? (creatingItem.idEmpresa ?? '') : (empresaDestinoId ?? '')}
                    onChange={(v) => { setCreatingItem({ ...creatingItem, idEmpresa: v === '' ? null : Number(v) }); setCreatingItemError(null) }}
                    disabled={!isAdmin}
                    options={[
                      ...(isAdmin ? [{ value: '' as const, label: 'Global (todas las empresas)' }] : []),
                      ...(empresaDestinoId != null ? [{ value: empresaDestinoId, label: empresas.find((e) => e.id === empresaDestinoId)?.nombre || 'Productor' }] : []),
                    ]}
                    placeholder="Productor"
                  />
                </div>
                <div className="pt-1 space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Descripción</label>
                  <textarea
                    value={creatingItem.descripcion}
                    onChange={(e) => { setCreatingItem({ ...creatingItem, descripcion: e.target.value }); setCreatingItemError(null) }}
                    placeholder="Detalles adicionales..."
                    rows={2}
                    className={inputCls + ' resize-none'}
                  />
                </div>
                <div className="pt-1 space-y-1.5">
                  <label className="text-xs font-medium text-foreground">{creatingItem.kind === 'labor' ? 'Precio / ha (referencia - en pesos $)' : 'Precio referencia (en pesos $)'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={creatingItem.precioUnitario}
                    onChange={(e) => { setCreatingItem({ ...creatingItem, precioUnitario: e.target.value }); setCreatingItemError(null) }}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </div>
                {creatingItem.kind !== 'labor' && (
                  <div className="pt-1 space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Unidad</label>
                    <SelectAutocomplete
                      value={creatingItem.unidad}
                      onChange={(v) => { setCreatingItem({ ...creatingItem, unidad: String(v) }); setCreatingItemError(null) }}
                      options={[
                        { value: '', label: 'Sin unidad' },
                        ...UNIDADES_PRECIO.map((u) => ({ value: u, label: u })),
                      ]}
                      placeholder="Sin unidad"
                    />
                  </div>
                )}
                {creatingItem.kind === 'insumo' && (
                  <div className="pt-1 space-y-2 border border-dashed border-border rounded-sm p-2">
                    <label className="text-xs font-medium text-foreground">Categoría</label>
                    {!creatingCategoriaOpen ? (
                      <div className="flex gap-2 items-center">
                        <SelectAutocomplete
                          className="flex-1 min-w-0"
                          value={creatingItem.categoriaId ?? ''}
                          onChange={(v) => { setCreatingItem({ ...creatingItem, categoriaId: v === '' ? null : Number(v) }); setCreatingItemError(null) }}
                          options={catalogCategorias
                            .filter((c) => c.activo !== false)
                            .map((c) => ({ value: c.id, label: c.nombre }))}
                          placeholder="Seleccionar categoría..."
                        />
                        {canManageCategorias && !creatingItem.categoriaId && (
                          <button
                            type="button"
                            onClick={() => { setCreatingCategoriaError(null); setCreatingCategoriaOpen(true) }}
                            className="px-3 py-2 border border-border rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
                            title="Crear nueva categoría"
                            aria-label="Crear nueva categoría"
                          >
                            <FolderPlus className="size-4" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="text"
                          autoFocus
                          value={creatingCategoriaNombre}
                          onChange={(e) => { setCreatingCategoriaNombre(e.target.value); setCreatingCategoriaError(null) }}
                          placeholder="Nombre de la categoría"
                          className={inputCls}
                        />
                        {creatingCategoriaError && (
                          <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                            <AlertCircle className="size-3" strokeWidth={1.75} />
                            {creatingCategoriaError}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setCreatingCategoriaOpen(false); setCreatingCategoriaError(null) }}
                            className="flex-1 px-3 py-1.5 border border-border rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateCategoria}
                            disabled={!creatingCategoriaNombre.trim() || creatingCategoriaBusy}
                            className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {creatingCategoriaBusy && <Loader2 className="size-3 animate-spin" />}
                            Crear categoría
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {creatingItemError && (
                  <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                    <AlertCircle className="size-3" strokeWidth={1.75} />
                    {creatingItemError}
                  </p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setCreatingItem(null); setCreatingItemError(null) }} className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" disabled={!creatingItem.nombre.trim() || creatingItemBusy || (creatingItem.kind === 'insumo' && !creatingItem.categoriaId)} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer">
                  {creatingItemBusy && <Loader2 className="size-4 animate-spin" />}
                  {creatingItemBusy ? 'Creando…' : 'Crear'}
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
  const colClass = colSpan === 2 ? 'sm:col-span-2'
    : colSpan === 3 ? 'sm:col-span-3'
      : colSpan === 4 ? 'sm:col-span-4'
        : ''

  return (
    <div className={`space-y-1.5 ${colClass}`.trim()}>
      <label className="text-xs font-medium text-foreground inline-flex items-center gap-1.5">
        {Icon && <Icon className="size-3 text-muted-foreground" strokeWidth={1.75} />}
        {label}
      </label>
      {children}
    </div>
  )
}

function NumField<K extends keyof Cabecera>({
  label, field, cabecera, setCab, max,
}: {
  label: string
  field: K
  cabecera: Cabecera
  setCab: <K2 extends keyof Cabecera>(field: K2, value: Cabecera[K2]) => void
  max?: number
}) {
  const raw = cabecera[field] as string
  const numeric = parseFloat(raw)
  return (
    <Field label={label}>
      <NumberInput2
        value={Number.isFinite(numeric) ? numeric : 0}
        min={0}
        max={max}
        onCommit={(n) => {
          setCab(field, (n === 0 ? '0' : n.toFixed(2)) as Cabecera[K])
        }}
        className={inputCls + ' text-right tabular-nums'}
      />
    </Field>
  )
}

/**
 * Input numérico que NO recompone su valor desde el padre mientras el
 * usuario tipea. Mantiene el string en estado local, lo que evita que el
 * formateo (por defecto 2 decimales, configurable con `precision`) pise lo
 * que se está tipeando.
 *
 * El padre recibe el valor en `onBlur`.
 */
function NumberInput2({
  value, onCommit, min, max, className, precision = 2,
}: {
  value: number
  onCommit: (n: number) => void
  min?: number
  max?: number
  className?: string
  precision?: number
}) {
  const fmt = useCallback((n: number): string => {
    const p = Math.pow(10, precision)
    const v = Math.round(n * p) / p
    if (v === 0) return ''
    return v.toFixed(precision)
  }, [precision])
  const [display, setDisplay] = useState<string>(fmt(value))
  const focusedRef = useRef(false)
  // Refleja cambios externos del value (por ej. la precarga del precio de
  // referencia al seleccionar un ítem) sólo cuando el input no está enfocado,
  // para no pisar lo que el usuario está escribiendo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el display con el value del padre sólo si el usuario no está escribiendo (evita pisar lo tipeado)
    if (!focusedRef.current) setDisplay(fmt(value))
  }, [value, fmt])
  return (
    <input
      type="number"
      step={Math.pow(10, -precision)}
      min={min}
      max={max}
      value={display}
      onChange={(e) => { focusedRef.current = true; setDisplay(e.target.value) }}
      onFocus={() => { focusedRef.current = true }}
      onBlur={() => {
        focusedRef.current = false
        const n = parseFloat(display) || 0
        setDisplay(fmt(n))
        onCommit(n)
      }}
      className={className}
    />
  )
}

/**
 * Botón global de guardado para la vista Campaña.
 *  - isSaving: spinner + "Guardando…", deshabilitado.
 *  - hasChanges: "Guardar", habilitado.
 *  - sin cambios: "Guardado", deshabilitado.
 *  - error: "Error al guardar" + permite reintento.
 */
function SaveButton({
  isSaving, hasChanges, onClick,
}: {
  isSaving: boolean
  hasChanges: boolean
  onClick: () => void
}) {
  if (isSaving) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm opacity-80 cursor-not-allowed cursor-pointer"
      >
        <Loader2 className="size-4 animate-spin" />
        <span>Guardando…</span>
      </button>
    )
  }
  if (hasChanges) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
      >
        <Save className="size-4" />
        <span>Guardar</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      disabled
      className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-border bg-muted/40 text-muted-foreground rounded-md text-sm font-medium cursor-not-allowed cursor-pointer"
      title="Todos los cambios están guardados"
    >
      <Check className="size-4" />
      <span>Guardado</span>
    </button>
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
  // Los ítems de costo (subtract) se muestran con signo menos para indicar que
  // se restan de los ingresos. Todo resultado negativo (en cualquier fila) se
  // unifica en rojo.
  const fmt = (v: number) => {
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
      <td className={`px-4 py-2 ${bold ? 'font-semibold' : 'text-foreground'}`}>
        {label}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${tone}`}>
        {fmt(ha)}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${tone}`}>
        {fmt(lote)}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Tabla de detalle genérica
// ---------------------------------------------------------------------------
type ColumnDef =
  | { key: string; label: string; kind: 'select-with-create'; align?: 'right'; preloadField?: string }
  | { key: string; label: string; kind: 'date'; align?: 'right' }
  | { key: string; label: string; kind: 'text'; align?: 'right' }
  | { key: string; label: string; kind: 'number'; align?: 'right'; precision?: number }
  | { key: string; label: string; kind: 'precio-insumo'; align?: 'right' }
  | { key: string; label: string; kind: 'readonly-money'; align?: 'right' }

type CatalogOption = {
  id: number
  nombre: string
  precioUnitario?: number | null
  idCategoria?: number | null
  categoria?: { id: number; nombre: string } | null
}

interface DetalleTableProps<T extends { id: number }> {
  title: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  columns: ColumnDef[]
  rows: T[]
  catalogOptions: CatalogOption[]
  addLabel: string
  canAdd: boolean
  onAdd: () => void | Promise<void>
  onChange: (id: number, patch: Partial<T>) => void | Promise<void>
  onRemove: (id: number) => void | Promise<void>
  onCreateNew: (row: T, onCreated: (id: number) => void) => void
  computedRow: (row: T) => number
  totalLabel: string
  totalValue: number
  emptyHint?: string
  footer?: React.ReactNode
  /** Etiqueta (p.ej. categoría) que se muestra junto a cada opción del selector. */
  optionTag?: (o: CatalogOption) => React.ReactNode
  /** Clase de fondo de la fila según la fila (p.ej. color por prescripción). */
  rowBgOf?: (row: T) => string
  /** Devuelve el id de prescripción de la fila (si viene de una) para enlazarla. */
  prescripcionIdOf?: (row: T) => number | null
  dolar?: number
  /** Si el total está en USD, se muestra convertido a pesos (insumos). */
  totalUsd?: boolean
}

function DetalleTable<T extends { id: number }>({
  title, icon: Icon, columns, rows, catalogOptions, addLabel, canAdd,
  onAdd, onChange, onRemove, onCreateNew, computedRow, totalLabel, totalValue, emptyHint, footer,
  optionTag, dolar, totalUsd, rowBgOf, prescripcionIdOf,
}: DetalleTableProps<T>) {
  // Fusiona las opciones activas del catálogo con los ítems ya referenciados
  // por filas guardadas (que pueden estar inactivos) para no perder su nombre
  // en el <select>.
  const catalogWithSaved = useMemo(() => {
    const map = new Map<number, CatalogOption>()
    for (const o of catalogOptions) map.set(o.id, o)
    for (const r of rows as Array<Record<string, unknown>>) {
      const rel = (r.labor || r.insumo || r.costo) as {
        id?: number; nombre?: string; precioUnitario?: number | null
        idCategoria?: number | null; categoria?: { id: number; nombre: string } | null
      } | undefined
      if (rel?.id && rel.nombre) {
        const prev = map.get(rel.id)
        map.set(rel.id, {
          id: rel.id,
          nombre: rel.nombre,
          precioUnitario: prev?.precioUnitario ?? rel.precioUnitario,
          idCategoria: prev?.idCategoria ?? rel.idCategoria,
          categoria: prev?.categoria ?? rel.categoria,
        })
      }
    }
    return Array.from(map.values())
  }, [catalogOptions, rows])

  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider inline-flex items-center gap-2">
          <Icon className="size-4" strokeWidth={1.75} />
          {title}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          {canAdd && (
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Plus className="size-3.5" strokeWidth={2} />
              {addLabel}
            </button>
          )}
        </div>
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
                    className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.kind === 'select-with-create' ? 'min-w-[300px]' : ''}`}
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
                rows.map((row) => {
                  const rowCls = rowBgOf ? rowBgOf(row) : ''
                  return (
                    <tr key={row.id} className={`${rowCls}${rowCls ? '' : ' hover:bg-muted/30'}`}>
                      {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''}`}
                      >
                        {renderCell(c, row, { catalogOptions: catalogWithSaved, onChange, onCreateNew, computedRow, dolar, totalUsd, optionTag })}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        {(() => {
                          const pid = prescripcionIdOf ? prescripcionIdOf(row) : null
                          return pid != null ? (
                            <Link
                              to={`/prescripciones/${pid}`}
                              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-primary transition-colors"
                              title="Ver prescripción"
                              aria-label="Ver prescripción"
                            >
                              <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
                            </Link>
                          ) : null
                        })()}
                        <button
                          onClick={() => onRemove(row.id)}
                          className="p-1.5 rounded-md text-destructive hover:bg-destructive-soft transition-colors cursor-pointer"
                          title="Eliminar"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td
                    colSpan={Math.max(columns.length - 1, 0)}
                    className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {totalLabel}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-semibold text-foreground tabular-nums">
                    {totalUsd
                      ? fmtPrecioInsumo(totalValue, 'pesos', dolar ?? 0)
                      : fmtMoneda(totalValue, 2)}
                  </td>
                  <td className="w-10" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {footer}
    </section>
  )
}

interface CellCtx<T> {
  catalogOptions: CatalogOption[]
  onChange: (id: number, patch: Partial<T>) => void | Promise<void>
  onCreateNew: (row: T, onCreated: (id: number) => void) => void
  computedRow: (row: T) => number
  dolar?: number
  totalUsd?: boolean
  optionTag?: (o: CatalogOption) => React.ReactNode
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
        <SelectAutocomplete
          className="flex-1 min-w-0"
          value={v ?? ''}
          onChange={(nv) => {
            const val = Number(nv)
            ctx.onChange(row.id, { [col.key]: val } as Partial<T>)
            // Precarga el precio de referencia del ítem seleccionado en el
            // campo de costo unitario (editable después). Se asigna siempre:
            // 0 si el ítem no tiene precio de referencia.
            if (col.preloadField) {
              const opt = ctx.catalogOptions.find((o) => o.id === val)
              ctx.onChange(row.id, { [col.preloadField]: opt?.precioUnitario ?? 0 } as Partial<T>)
            }
          }}
          options={ctx.catalogOptions.map((o) => ({ value: o.id, label: o.nombre }))}
          placeholder="Elegí…"
          renderTag={(opt) => {
            const o = ctx.catalogOptions.find((x) => x.id === Number(opt.value))
            return o && ctx.optionTag ? ctx.optionTag(o) : null
          }}
        />
        <button
          type="button"
          onClick={() => ctx.onCreateNew(row, (newId) => ctx.onChange(row.id, { [col.key]: newId } as Partial<T>))}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer shrink-0"
          title="Crear nuevo"
          aria-label="Crear nuevo"
        >
          <Plus className="size-4" strokeWidth={1.75} />
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
  if (col.kind === 'text') {
    const v = cellValue(col.key) as string | undefined
    return (
      <input
        type="text"
        value={v ?? ''}
        onChange={(e) => ctx.onChange(row.id, { [col.key]: e.target.value } as Partial<T>)}
        placeholder="—"
        className="w-full px-2 py-1 bg-background border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
      />
    )
  }
  if (col.kind === 'number') {
    const v = cellValue(col.key) as number | undefined
    return (
      <NumberInput2
        value={typeof v === 'number' ? v : 0}
        min={0}
        precision={col.precision}
        onCommit={(n) => ctx.onChange(row.id, { [col.key]: n } as Partial<T>)}
        className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
      />
    )
  }
  if (col.kind === 'precio-insumo') {
    // El valor se guarda en USD; se muestra y edita siempre en pesos usando el
    // dólar venta. Al editar se convierte de vuelta a USD para el guardado.
    const v = cellValue(col.key) as number | undefined
    const raw = typeof v === 'number' && Number.isFinite(v) ? v : 0
    const d = ctx.dolar && ctx.dolar > 0 ? ctx.dolar : 1
    return (
      <NumberInput2
        value={raw * d}
        min={0}
        onCommit={(n) => {
          ctx.onChange(row.id, { [col.key]: n / d } as Partial<T>)
        }}
        className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
      />
    )
  }
  if (col.kind === 'readonly-money') {
    const v = ctx.computedRow(row)
    return (
      <span className="tabular-nums text-sm text-foreground">
        {ctx.totalUsd
          ? fmtPrecioInsumo(v, 'pesos', ctx.dolar ?? 0)
          : fmtMoneda(v, 2)}
      </span>
    )
  }
  return null
}
