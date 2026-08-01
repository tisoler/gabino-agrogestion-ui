import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
  calcularResultados, formatInputNumber, round2,
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
  }
}

function buildInsumoOrCostoPayload(row: {
  idInsumo?: number | null
  idCosto?: number | null
  unidadesHa?: number | null
  costoUnidad?: number | null
}) {
  return {
    idInsumo: (row as any).idInsumo ?? 0,
    idCosto: (row as any).idCosto ?? 0,
    unidadesHa: typeof row.unidadesHa === 'number' && !Number.isNaN(row.unidadesHa)
      ? row.unidadesHa
      : 0,
    costoUnidad: typeof row.costoUnidad === 'number' && !Number.isNaN(row.costoUnidad)
      ? row.costoUnidad
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

  const { permisos, isSysAdmin, currentEmpresaId, empresas } = useAuth()
  const canWrite = permisos.includes('escritura:campania')
  const canRead = permisos.includes('lectura:campania')

  const [empresaDestinoId, setEmpresaDestinoId] = useState<number | null>(
    isNew ? (isSysAdmin ? null : currentEmpresaId) : null
  )

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
  const [saveError, setSaveError] = useState<string | null>(null)

  // Contador que se incrementa en cada cambio. El useEffect del debounce
  // depende de él, así que cualquier edición resetea el timer de 3s.
  const [dirtyVersion, setDirtyVersion] = useState(0)
  const bumpDirty = useCallback(() => setDirtyVersion((v) => v + 1), [])

  // Contador de IDs temporales para filas nuevas
  const tempIdCounter = useRef(0)
  const newTempId = () => -++tempIdCounter.current

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
  const [creatingItemError, setCreatingItemError] = useState<string | null>(null)
  const [creatingItemBusy, setCreatingItemBusy] = useState(false)

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
    const first = catalogLabores[0]
    const tempId = newTempId()
    const newRow: CampaniaLaborDetalle = {
      id: tempId,
      idCampania: campaniaId,
      idLabor: first.id,
      fecha: todayLocalISO(),
      superficieLaboreada: 0,
      costoLaborHa: 0,
      labor: first,
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
    const first = catalogInsumos[0]
    const tempId = newTempId()
    const newRow: CampaniaInsumoDetalle = {
      id: tempId,
      idCampania: campaniaId,
      idInsumo: first.id,
      unidadesHa: 0,
      costoUnidad: 0,
      insumo: first,
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
    const first = catalogCostos[0]
    const tempId = newTempId()
    const newRow: CampaniaCostoDetalle = {
      id: tempId,
      idCampania: campaniaId,
      idCosto: first.id,
      unidadesHa: 0,
      costoUnidad: 0,
      costo: first,
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
    if (cabecera.nombre !== cabeceraSaved.nombre) return true
    if (cabecera.anioDesde !== cabeceraSaved.anioDesde) return true
    if (cabecera.anioHasta !== cabeceraSaved.anioHasta) return true
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
    const endpoint = creatingItem.kind === 'labor' ? '/labores'
      : creatingItem.kind === 'insumo' ? '/insumos' : '/costos'
    setCreatingItemBusy(true)
    setCreatingItemError(null)
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
        <div className="flex items-center gap-2 shrink-0">
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
          </Field>

          <Field label="Nombre campaña" icon={Calendar} colSpan={2}>
            <input
              type="text"
              value={cabecera.nombre}
              onChange={(e) => setCab('nombre', e.target.value)}
              placeholder="Ej: Lote ESTE 2024-25"
              className={inputCls}
            />
          </Field>

          <Field label="Año desde">
            <input
              type="number"
              min={1900}
              max={2200}
              value={cabecera.anioDesde}
              onChange={(e) => setCab('anioDesde', Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="Año hasta">
            <input
              type="number"
              min={1900}
              max={2200}
              value={cabecera.anioHasta}
              onChange={(e) => setCab('anioHasta', Number(e.target.value))}
              className={inputCls}
            />
          </Field>

          <Field label="Cultivo" icon={Sprout}>
            <select
              value={cabecera.idCultivo ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                setCab('idCultivo', v)
                setCab('idVariedad', null)
              }}
              className={inputCls}
            >
              <option value="">Elegí cultivo</option>
              {cultivos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>

          <Field label="Variedad / Híbrido">
            <select
              value={cabecera.idVariedad ?? ''}
              onChange={(e) => setCab('idVariedad', e.target.value === '' ? null : Number(e.target.value))}
              disabled={!cabecera.idCultivo}
              className={inputCls + ' disabled:opacity-60'}
            >
              <option value="">{cabecera.idCultivo ? 'Sin variedad' : 'Elegí cultivo primero'}</option>
              {variedadesFiltradas.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
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
            totalLabel="Costo total de labores"
            totalValue={resultados.costoTotalLaboresHa}
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
            totalLabel="Costo total de insumos"
            totalValue={resultados.costoTotalInsumosHa}
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
            totalLabel="Costo total de costos varios"
            totalValue={resultados.costoTotalCostosHa}
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
          </section>

          {/* Botón Guardar al pie */}
          <div className="flex justify-end pt-2">
            <SaveButton isSaving={isSaving} hasChanges={hasChanges} onClick={save} />
          </div>
        </>
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
              <button onClick={() => { setCreatingItem(null); setCreatingItemError(null) }} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent" aria-label="Cerrar">
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
                <p className="text-[11px] text-muted-foreground">
                  Se asignará a la empresa{' '}
                  <span className="font-medium text-foreground">
                    {empresas.find((e) => e.id === empresaDestinoId)?.nombre || 'actual'}
                  </span>.
                </p>
                {creatingItemError && (
                  <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                    <AlertCircle className="size-3" strokeWidth={1.75} />
                    {creatingItemError}
                  </p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setCreatingItem(null); setCreatingItemError(null) }} className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent">
                  Cancelar
                </button>
                <button type="submit" disabled={!creatingItem.nombre.trim() || creatingItemBusy} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2">
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
 * formateo a 2 decimales (o el parseo) pise lo que se está tipeando.
 *
 * El padre recibe el valor en `onBlur`, ya redondeado a 2 decimales.
 */
function NumberInput2({
  value, onCommit, min, max, className,
}: {
  value: number
  onCommit: (n: number) => void
  min?: number
  max?: number
  className?: string
}) {
  const [display, setDisplay] = useState<string>(formatInputNumber(value))
  return (
    <input
      type="number"
      step="0.01"
      min={min}
      max={max}
      value={display}
      onChange={(e) => setDisplay(e.target.value)}
      onBlur={() => {
        const n = round2(parseFloat(display) || 0)
        setDisplay(formatInputNumber(n))
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
        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm opacity-80 cursor-not-allowed"
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
        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
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
      className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-border bg-muted/40 text-muted-foreground rounded-md text-sm font-medium cursor-not-allowed"
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
        {fmtMoneda(ha, 2)}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${tone}`}>
        {fmtMoneda(lote, 2)}
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
  totalLabel: string
  totalValue: number
  emptyHint?: string
}

function DetalleTable<T extends { id: number }>({
  title, icon: Icon, columns, rows, catalogOptions, addLabel, canAdd,
  onAdd, onChange, onRemove, onCreateNew, computedRow, totalLabel, totalValue, emptyHint,
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
                    {fmtMoneda(totalValue, 2)}
                  </td>
                  <td className="w-10" />
                </tr>
              </tfoot>
            )}
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
      <NumberInput2
        value={typeof v === 'number' ? v : 0}
        min={0}
        onCommit={(n) => ctx.onChange(row.id, { [col.key]: n } as Partial<T>)}
        className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
      />
    )
  }
  if (col.kind === 'readonly-money') {
    const v = ctx.computedRow(row)
    return <span className="tabular-nums text-sm text-foreground">{fmtMoneda(v, 2)}</span>
  }
  return null
}
