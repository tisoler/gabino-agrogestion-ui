import { useState, useMemo, useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, AlertCircle, Loader2, Calendar, Building2,
  Pickaxe, Package, FolderPlus, X, CheckCircle2, Eye,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { periodosCampania } from '../lib/campanias'
import { colorCategoria } from '../constantes'
import { fmtHa } from '../lib/prescripciones'
import { useVolver } from '../lib/navegacion'
import NuevoInsumoModal from '../components/NuevoInsumoModal'
import ProduccionDetalleModal from '../components/ProduccionDetalleModal'
import SelectAutocomplete from '../components/SelectAutocomplete'
import MultiselectFilter from '../components/MultiselectFilter'

const fetcher = (url: string) => api.get(url).then((r) => r.data)
const todayLocalISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  totales?: { supSembrada?: number }
}
interface Lote {
  id: number
  idEmpresa: number
  descripcion: string | null
  idCampo?: number | null
  campo?: { id: number; nombre: string } | null
}
interface Cultivo { id: number; nombre: string; variedades: { id: number; nombre: string }[] }
interface Labor { id: number; nombre: string }
interface Insumo {
  id: number
  nombre: string
  unidad?: string | null
  idCategoria?: number | null
  categoria?: { id: number; nombre: string } | null
}

interface InsumoRow {
  tempId: number
  idInsumo: number | ''
  cantidadPorHa: string
  cantidadTotal: string
  lastEdited: 'porHa' | 'total' | null
}

const num = (s: string): number => {
  const t = s.trim()
  if (t === '') return 0
  const n = Number(t.replace(/,/g, '.'))
  return Number.isFinite(n) ? n : 0
}

/** Normaliza el separador decimal a coma (acepta punto o coma al tipear). */
const fmtInputDecimal = (s: string): string => s.replace(/\./g, ',')

function fmtNumValue(n: number): string {
  if (!Number.isFinite(n) || n === 0) return n === 0 ? '0' : ''
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

/** Formateo para "Cantidad / ha" con 3 decimales. */
function fmtNumValue3(n: number): string {
  if (!Number.isFinite(n) || n === 0) return n === 0 ? '0' : ''
  return n.toLocaleString('es-AR', { maximumFractionDigits: 3 })
}

export default function PrescripcionNueva() {
  const navigate = useNavigate()
  const volver = useVolver('/prescripciones')
  const { mutate } = useSWRConfig()
  const { permisos, isSysAdmin, isAsesorAdmin, user, empresas } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const canWrite = permisos.includes('escritura:prescripcion')

  const empresasVisibles = useMemo(() => {
    if (isAdmin) return empresas
    const ids = (user?.idEmpresas || []).map(Number)
    return empresas.filter((e) => ids.includes(e.id))
  }, [isAdmin, user, empresas])

  // Paso 1: productor + período, campos y lotes (múltiple). El cultivo se
  // resuelve por fila (cada lote elige su producción de la campaña).
  const [fecha, setFecha] = useState(todayLocalISO())
  const [idEmpresa, setIdEmpresa] = useState<number | ''>('')
  const [periodo, setPeriodo] = useState<string>('')
  const [camposSel, setCamposSel] = useState<string[]>([])
  const [lotesSel, setLotesSel] = useState<string[]>([])
  /** Producción elegida por lote (clave: id lote, valor: id campaña). */
  const [cultivosSel, setCultivosSel] = useState<Record<number, number>>({})
  /** Ha a aplicar por producción (clave: id de campaña). Sin clave = sembrada. */
  const [supAplicada, setSupAplicada] = useState<Record<number, string>>({})

  // Catálogos (sys-admin y asesor-admin ven todas las labores/insumos)
  const { data: lotes = [] } = useSWR<Lote[]>(canWrite ? '/lotes' : null, fetcher)
  const { data: cultivos = [] } = useSWR<Cultivo[]>(canWrite ? '/cultivos' : null, fetcher)
  const { data: labores = [] } = useSWR<Labor[]>(canWrite ? ['/labores', 'all'] : null, () =>
    api.get('/labores', { params: { all: true } }).then((r) => r.data))
  const { data: insumos = [], mutate: mutateInsumos } = useSWR<Insumo[]>(canWrite ? ['/insumos', 'all'] : null, () =>
    api.get('/insumos', { params: { all: true } }).then((r) => r.data))
  const { data: categoriasInsumo = [] } = useSWR<{ id: number; nombre: string }[]>(
    canWrite ? '/categorias' : null,
    fetcher,
  )

  // Producciones del productor seleccionado; de ahí se derivan las opciones
  // de cada selector (campañas → lotes → cultivos).
  const {
    data: producciones = [],
    isLoading: loadingProduccion,
    mutate: mutateProduccion,
  } = useSWR<CampaniaOption[]>(
    canWrite && idEmpresa !== '' ? ['/campanias', 'produccion', idEmpresa] : null,
    async () => {
      const res = await api.get('/campanias', {
        params: { empresaIds: Number(idEmpresa) },
      })
      return res.data as CampaniaOption[]
    }
  )

  const periodosDisponibles = useMemo(
    () =>
      Array.from(new Set(producciones.map((p) => p.campania).filter((c): c is string => !!c)))
        .sort((a, b) => b.localeCompare(a, 'es')),
    [producciones]
  )

  const lotesEmpresa = useMemo(
    () => (idEmpresa === '' ? [] : lotes.filter((l) => l.idEmpresa === Number(idEmpresa))),
    [lotes, idEmpresa]
  )

  // Campos y lotes del catálogo del productor; los campos elegidos filtran los
  // lotes (patrón de cascada con poda de la selección vigente).
  const camposOpciones = useMemo(() => {
    const seen = new Map<number, string>()
    let sinCampo = false
    for (const l of lotesEmpresa) {
      if (l.campo) seen.set(l.campo.id, l.campo.nombre)
      else sinCampo = true
    }
    const opciones = Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([value, label]) => ({ value: String(value), label }))
    if (sinCampo) opciones.push({ value: '0', label: 'Sin campo' })
    return opciones
  }, [lotesEmpresa])

  const lotesOpciones = useMemo(
    () =>
      lotesEmpresa
        .filter((l) => camposSel.length === 0 || camposSel.includes(String(l.idCampo ?? 0)))
        .map((l) => ({
          value: String(l.id),
          label: l.descripcion || `Lote #${l.id}`,
          campoId: l.idCampo ?? 0,
          campoNombre: l.campo?.nombre || 'Sin campo',
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [lotesEmpresa, camposSel]
  )

  const lotesEfectivos = useMemo(
    () => lotesSel.filter((id) => lotesOpciones.some((o) => o.value === id)),
    [lotesSel, lotesOpciones]
  )

  // Producciones del período agrupadas por lote.
  const produccionesPorLote = useMemo(() => {
    const map = new Map<number, { campaniaId: number; cultivoNombre: string; supSembrada?: number }[]>()
    if (periodo === '') return map
    for (const p of producciones) {
      if (p.campania !== periodo || !p.lote || !p.cultivo) continue
      const arr = map.get(p.lote.id) ?? []
      arr.push({ campaniaId: p.id, cultivoNombre: p.cultivo.nombre, supSembrada: p.totales?.supSembrada })
      map.set(p.lote.id, arr)
    }
    return map
  }, [producciones, periodo])

  const filasLotes = useMemo(
    () =>
      lotesOpciones
        .filter((o) => lotesEfectivos.includes(o.value))
        .map((o) => ({
          ...o,
          loteId: Number(o.value),
          producciones: produccionesPorLote.get(Number(o.value)) ?? [],
        })),
    [lotesOpciones, lotesEfectivos, produccionesPorLote]
  )

  // Producción resuelta de la fila: la elegida en el selector o, si el lote
  // tiene una sola producción, esa directamente.
  const campaniaDeFila = useCallback(
    (f: { loteId: number; producciones: { campaniaId: number }[] }): number | null => {
      if (f.producciones.length === 0) return null
      const elegido = cultivosSel[f.loteId]
      if (elegido != null && f.producciones.some((p) => p.campaniaId === elegido)) return elegido
      return f.producciones.length === 1 ? f.producciones[0].campaniaId : null
    },
    [cultivosSel]
  )

  const setFilaCampania = (loteId: number, campaniaId: number) =>
    setCultivosSel((m) => ({ ...m, [loteId]: campaniaId }))

  /** Ha a aplicar de una producción (sin editar = sembrada). */
  const supDeCampania = useCallback(
    (campaniaId: number, supSembrada?: number): number => {
      const editada = supAplicada[campaniaId]
      if (editada != null) return num(editada)
      return supSembrada && supSembrada > 0 ? supSembrada : 0
    },
    [supAplicada]
  )

  // Únicamente las filas con producción resuelta entran en la prescripción;
  // las que no tienen producción se destacan y se ignoran al guardar.
  const filasResueltas = useMemo(
    () =>
      filasLotes.flatMap((f) => {
        const campaniaId = campaniaDeFila(f)
        if (campaniaId == null) return []
        const prod = f.producciones.find((p) => p.campaniaId === campaniaId)
        return [{
          campaniaId,
          superficie: supDeCampania(campaniaId, prod?.supSembrada),
        }]
      }),
    [filasLotes, campaniaDeFila, supDeCampania]
  )

  // Lotes con producción pero sin cultivo elegido (más de una): hay que
  // resolverlos antes de guardar.
  const filasPendientas = filasLotes.filter(
    (f) => f.producciones.length > 0 && campaniaDeFila(f) == null
  )
  const filasSinProduccion = filasLotes.filter((f) => f.producciones.length === 0)

  const totalHaNum = useMemo(
    () => filasResueltas.reduce((acc, o) => acc + o.superficie, 0),
    [filasResueltas]
  )

  // Paso 2: labor (la superficie se carga por lote en el paso 1)
  const [idLabor, setLabor] = useState<number | ''>('')
  const [observaciones, setObservaciones] = useState('')

  // Paso 3: insumos
  const [insumoRows, setInsumoRows] = useState<InsumoRow[]>([])
  const [tempCounter, setTempCounter] = useState<number>(-1)

  // Modales
  const [showCampaniaModal, setShowCampaniaModal] = useState(false)
  // Modal "Ver producción": id de la campaña de la fila elegida.
  const [produccionModalId, setProduccionModalId] = useState<number | null>(null)
  const [campaniaForm, setCampaniaForm] = useState({
    campania: periodosCampania()[0] || '',
    idCampo: '' as number | '',
    idLote: '' as number | '', idCultivo: '' as number | '', idVariedad: '' as number | '',
    /** Opcional: si queda vacío, el backend la deja en 0 (editable después). */
    supSembrada: '',
  })
  const [showInsumoModal, setShowInsumoModal] = useState(false)
  const [insumoForRow, setInsumoForRow] = useState<number | null>(null)

  // Campos del modal "Nueva producción": el campo seleccionado filtra los lotes.
  const camposModal = useMemo(() => {
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

  const lotesModal = useMemo(() => {
    if (campaniaForm.idCampo === '') return lotesEmpresa
    const target = campaniaForm.idCampo === 0 ? null : Number(campaniaForm.idCampo)
    return lotesEmpresa.filter((l) => (l.idCampo ?? null) === target)
  }, [lotesEmpresa, campaniaForm.idCampo])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campaniaError, setCampaniaError] = useState<string | null>(null)

  const canAddInsumos =
    idEmpresa !== '' && periodo !== '' && idLabor !== '' &&
    filasPendientas.length === 0 && filasResueltas.length > 0 && totalHaNum > 0

  // Insumo temporal: variedades del cultivo seleccionado en el modal campaña
  const variedadesModal = useMemo(() => {
    if (campaniaForm.idCultivo === '') return []
    return cultivos.find((c) => c.id === Number(campaniaForm.idCultivo))?.variedades || []
  }, [cultivos, campaniaForm.idCultivo])

  const addInsumo = () => {
    setInsumoRows((rows) => [
      ...rows,
      { tempId: tempCounter, idInsumo: '', cantidadPorHa: '', cantidadTotal: '', lastEdited: null },
    ])
    setTempCounter((c) => c - 1)
  }

  const removeInsumo = (tempId: number) => setInsumoRows((rows) => rows.filter((r) => r.tempId !== tempId))

  // Edición de cantidad con recálculo del otro campo: total = cant_ha * total_ha
  const updatePorHa = (tempId: number, value: string) => {
    const clean = fmtInputDecimal(value)
    setInsumoRows((rows) =>
      rows.map((r) =>
        r.tempId === tempId
          ? { ...r, cantidadPorHa: clean, lastEdited: 'porHa', cantidadTotal: fmtNumValue(num(clean) * totalHaNum) }
          : r
      )
    )
  }

  const updateTotal = (tempId: number, value: string) => {
    const clean = fmtInputDecimal(value)
    setInsumoRows((rows) =>
      rows.map((r) =>
        r.tempId === tempId
          ? {
            ...r,
            cantidadTotal: clean,
            lastEdited: 'total',
            cantidadPorHa: totalHaNum > 0 ? fmtNumValue3(num(clean) / totalHaNum) : r.cantidadPorHa,
          }
          : r
      )
    )
  }

  const recomputeByTotalHa = useCallback((rows: InsumoRow[], newTotalHa: number) => {
    return rows.map((r) => {
      if (r.lastEdited === 'porHa') {
        return { ...r, cantidadTotal: fmtNumValue(num(r.cantidadPorHa) * newTotalHa) }
      }
      if (r.lastEdited === 'total') {
        return { ...r, cantidadPorHa: newTotalHa > 0 ? fmtNumValue3(num(r.cantidadTotal) / newTotalHa) : r.cantidadPorHa }
      }
      return r
    })
  }, [])

  // Superficie a aplicar de una producción: recalcula las cantidades de los
  // insumos contra el nuevo total (suma de filas resueltas).
  const updateSup = (campaniaId: number, value: string) => {
    const clean = fmtInputDecimal(value)
    setSupAplicada((m) => ({ ...m, [campaniaId]: clean }))
    const nuevoTotal = filasResueltas.reduce(
      (acc, o) => acc + (o.campaniaId === campaniaId ? num(clean) : o.superficie),
      0,
    )
    setInsumoRows((rows) => recomputeByTotalHa(rows, nuevoTotal))
  }

  // Toggle de lotes: poda cultivos elegidos y superficies de lotes quitados.
  const toggleLotes = (next: string[]) => {
    setLotesSel(next)
    const nums = new Set(next.map(Number))
    setCultivosSel((m) => {
      const limpio: Record<number, number> = {}
      for (const [k, v] of Object.entries(m)) {
        if (nums.has(Number(k))) limpio[Number(k)] = v
      }
      return limpio
    })
    setSupAplicada((m) => {
      const vigentes = new Set<number>()
      for (const [loteId, prods] of produccionesPorLote.entries()) {
        if (nums.has(loteId)) for (const p of prods) vigentes.add(p.campaniaId)
      }
      const limpio: Record<number, string> = {}
      for (const [k, v] of Object.entries(m)) {
        if (vigentes.has(Number(k))) limpio[Number(k)] = v
      }
      return limpio
    })
  }

  // "Crear producción" de una fila: abre el modal con el lote y el período.
  const abrirModalParaFila = (f: { loteId: number; campoId: number }) => {
    setCampaniaError(null)
    setCampaniaForm((form) => ({
      ...form,
      campania: periodo || form.campania,
      idLote: f.loteId,
      idCampo: f.campoId,
    }))
    setShowCampaniaModal(true)
  }

  // Crear producción desde el modal (desde la fila de un lote sin producción).
  // La fila queda apuntando a la producción recién creada. `creandoCampania`
  // bloquea el botón para evitar doble submit.
  const [creandoCampania, setCreandoCampania] = useState(false)
  const handleCreateCampania = async () => {
    if (creandoCampania) return
    setCampaniaError(null)
    setCreandoCampania(true)
    try {
      const payload: Record<string, unknown> = {
        campania: campaniaForm.campania,
        idLote: Number(campaniaForm.idLote),
        idCultivo: Number(campaniaForm.idCultivo),
      }
      if (campaniaForm.idVariedad !== '') payload.idVariedad = Number(campaniaForm.idVariedad)
      const sup = num(campaniaForm.supSembrada)
      if (sup > 0) payload.supSembrada = sup
      const { data: nueva } = await api.post('/campanias', payload)
      const loteNuevo = Number(campaniaForm.idLote)
      const campoNuevo = lotes.find((l) => l.id === loteNuevo)?.idCampo ?? 0
      setPeriodo(campaniaForm.campania)
      setCamposSel((s) => (s.includes(String(campoNuevo)) ? s : [...s, String(campoNuevo)]))
      setLotesSel((s) => {
        const key = String(loteNuevo)
        return s.includes(key) ? s : [...s, key]
      })
      await mutateProduccion()
      const nuevaId: number | undefined = (nueva as { id?: number })?.id
      if (nuevaId != null) setCultivosSel((m) => ({ ...m, [loteNuevo]: nuevaId }))
      setShowCampaniaModal(false)
      setCampaniaError(null)
      setCampaniaForm({
        campania: periodosCampania()[0] || '',
        idCampo: '', idLote: '', idCultivo: '', idVariedad: '', supSembrada: '',
      })
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setCampaniaError(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo crear la producción.')
    } finally {
      setCreandoCampania(false)
    }
  }

  const canSave =
    fecha !== '' && periodo !== '' && idLabor !== '' &&
    filasPendientas.length === 0 && filasResueltas.length > 0 &&
    filasResueltas.every((o) => o.superficie > 0) &&
    insumoRows.every((r) => r.idInsumo !== '')

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        fecha,
        idLabor: Number(idLabor),
        observaciones: observaciones.trim() || undefined,
        // Las filas sin producción (resaltadas) no se agregan.
        lotes: filasResueltas.map((o) => ({
          idCampania: o.campaniaId,
          superficieAplicada: o.superficie,
        })),
        insumos: insumoRows
          .filter((r) => r.idInsumo !== '')
          .map((r) => ({
            idInsumo: Number(r.idInsumo),
            cantidadPorHa: num(r.cantidadPorHa),
            cantidadTotal: num(r.cantidadTotal),
          })),
      }
      const { data } = await api.post('/prescripciones', payload)
      // La prescripción asigna labor/insumos a la campaña: invalidá el cache
      // de campañas (detalle y listado) y de prescripciones para que reflejen
      // los datos sin tener que refrescar la app.
      const keyBase = (key: unknown): string =>
        typeof key === 'string' ? key : Array.isArray(key) && typeof key[0] === 'string' ? key[0] : ''
      await mutate(
        (key) => keyBase(key).startsWith('/campanias'),
        undefined,
        { revalidate: true },
      )
      await mutate(
        (key) => keyBase(key).startsWith('/prescripciones'),
        undefined,
        { revalidate: true },
      )
      navigate(`/prescripciones/${data.id}`)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo guardar la prescripción.')
    } finally {
      setSaving(false)
    }
  }

  if (!canWrite) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tienes permisos para crear prescripciones.</p>
      </div>
    )
  }

  const inputCls =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const labelCls = 'text-xs font-medium text-foreground'

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={volver}
            className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Volver"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Nueva Prescripción</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Receta de aplicación de labor e insumos sobre una producción</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-destructive-soft text-destructive border border-destructive/30 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="size-4 shrink-0" strokeWidth={1.75} />
          <span>{error}</span>
        </div>
      )}

      {/* Fecha */}
      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-primary" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Datos de la producción</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls + ' cursor-pointer'} />
          </div>
          <SelectAutocomplete
            label="Productor"
            value={idEmpresa}
            onChange={(v) => {
              setIdEmpresa(Number(v))
              setPeriodo('')
              setCamposSel([])
              setLotesSel([])
              setCultivosSel({})
              setSupAplicada({})
            }}
            options={empresasVisibles.map((e) => ({ value: e.id, label: e.nombre }))}
            placeholder="Seleccionar productor..."
            autoSelectSingle
          />
        </div>

        {/* Producción: productor + campaña + campos (múltiple) + lotes (múltiple) */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectAutocomplete
              label="Campaña"
              value={periodo}
              onChange={(v) => {
                setPeriodo(String(v))
                setCamposSel([])
                setLotesSel([])
                setCultivosSel({})
                setSupAplicada({})
              }}
              options={periodosDisponibles.map((p) => ({ value: p, label: p }))}
              placeholder={idEmpresa === '' ? 'Elegí primero el productor' : 'Seleccionar campaña...'}
              disabled={idEmpresa === ''}
              sort={{ by: 'alfabetico', direction: 'desc' }}
              autoSelectSingle
              defaultFirst
            />
            <div className="space-y-1.5">
              <label className={labelCls}>Campo</label>
              <MultiselectFilter
                value={camposSel}
                opciones={camposOpciones}
                onChange={setCamposSel}
                placeholder="Todos los campos"
                etiqueta="campo"
                vacio="Elegí un productor primero."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Lotes</label>
            <MultiselectFilter
              value={lotesEfectivos}
              opciones={lotesOpciones.map((o) => ({ value: o.value, label: `${o.campoNombre} · ${o.label}` }))}
              onChange={toggleLotes}
              placeholder={periodo === '' ? 'Elegí campaña' : 'Seleccionar lotes...'}
              etiqueta="lote"
              vacio="No hay lotes para ese productor/campo."
            />
          </div>

          {idEmpresa === '' ? (
            <p className="text-[12px] text-muted-foreground">Elegí primero el productor.</p>
          ) : loadingProduccion ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Cargando producciones...</span>
            </div>
          ) : periodo === '' ? (
            <p className="text-[12px] text-muted-foreground">Elegí una campaña.</p>
          ) : lotesEfectivos.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Elegí al menos un lote.</p>
          ) : filasPendientas.length > 0 ? (
            <p className="text-[12px] text-warning-foreground">
              Asigná el cultivo en {filasPendientas.length === 1 ? 'el lote resaltado' : `los ${filasPendientas.length} lotes resaltados`} (tienen más de una producción en la campaña).
            </p>
          ) : filasResueltas.length === 0 ? (
            <p className="text-[12px] text-warning-foreground">
              Ninguno de los lotes elegidos tiene producción en esta campaña. Creala desde cada fila para incluirlo.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-success">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="font-medium">
                  {filasResueltas.length === 1 ? '1 lote' : `${filasResueltas.length} lotes`} a tratar,{' '}
                  <span className="text-primary font-semibold">
                    total a aplicar: {fmtHa(totalHaNum)}
                  </span>
                  {filasSinProduccion.length > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {' '}(se ignoran {filasSinProduccion.length === 1 ? '1 lote sin producción' : `${filasSinProduccion.length} lotes sin producción`})</span>
                  )}
                  . Ajustá las superficies e ingresá la labor.
                </span>
              </div>
            </div>
          )}

          {/* Una fila por lote: cultivo (si hay producción), superficie y acceso */}
          {filasLotes.length > 0 && (
            <div className="overflow-x-auto border border-border rounded-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campo</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lote</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cultivo</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sup. sembrada</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sup. a aplicar (ha)</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-10" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filasLotes.map((f) => {
                    const campaniaId = campaniaDeFila(f)
                    const prod = campaniaId != null ? f.producciones.find((p) => p.campaniaId === campaniaId) : undefined
                    const sinProduccion = f.producciones.length === 0
                    const editada = campaniaId != null ? supAplicada[campaniaId] : undefined
                    const defecto = prod?.supSembrada && prod.supSembrada > 0 ? fmtNumValue(prod.supSembrada) : ''
                    return (
                      <tr key={f.value} className={sinProduccion ? 'bg-warning-soft' : undefined}>
                        <td className="px-4 py-2 text-foreground">{f.campoNombre}</td>
                        <td className="px-4 py-2 font-medium text-foreground">{f.label}</td>
                        <td className="px-4 py-2 min-w-44">
                          {sinProduccion ? (
                            <button
                              type="button"
                              onClick={() => abrirModalParaFila(f)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-border bg-card rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                            >
                              <FolderPlus className="size-3.5 text-primary" strokeWidth={1.75} />
                              Crear producción
                            </button>
                          ) : f.producciones.length === 1 ? (
                            <span className="text-sm text-foreground">{f.producciones[0].cultivoNombre}</span>
                          ) : (
                            <SelectAutocomplete
                              value={campaniaId ?? ''}
                              onChange={(v) => setFilaCampania(f.loteId, Number(v))}
                              options={f.producciones.map((p) => ({ value: p.campaniaId, label: p.cultivoNombre }))}
                              placeholder="Elegí cultivo..."
                            />
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                          {prod?.supSembrada != null && prod.supSembrada > 0
                            ? prod.supSembrada.toLocaleString('es-AR', { maximumFractionDigits: 2 })
                            : '—'}
                        </td>
                        <td className="px-4 py-2 w-36">
                          {campaniaId != null ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editada != null ? editada : defecto}
                              onChange={(e) => updateSup(campaniaId, e.target.value)}
                              placeholder="0,00"
                              className={inputCls + ' text-right'}
                            />
                          ) : (
                            <p className="text-right text-muted-foreground">—</p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {campaniaId != null && (
                            <button
                              type="button"
                              onClick={() => setProduccionModalId(campaniaId)}
                              className="inline-flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                              title="Ver datos de la producción"
                              aria-label={`Ver producción de ${f.label}`}
                            >
                              <Eye className="size-4" strokeWidth={1.75} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/10">
                    <td colSpan={4} className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Total ha para aplicación
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-foreground">
                      {totalHaNum.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2" aria-hidden />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

        </div>
      </section>

      {/* Labor */}
      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Pickaxe className="size-4 text-primary" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Labor y superficie</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectAutocomplete
            label="Labor"
            value={idLabor}
            onChange={(v) => setLabor(Number(v))}
            options={labores.map((l) => ({ value: l.id, label: l.nombre }))}
            placeholder="Seleccionar labor..."
          />
          <div className="space-y-1.5">
            <label className={labelCls}>Total ha para aplicación</label>
            <p className="px-3 py-2 bg-muted/30 border border-border rounded-md text-sm tabular-nums text-foreground">
              {totalHaNum > 0
                ? `${totalHaNum.toLocaleString('es-AR', { maximumFractionDigits: 2 })} ha`
                : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground">Se calcula con la superficie de los lotes seleccionados.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Observaciones</label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Indicaciones sobre la labor a realizar (opcional)"
            rows={2}
            className={`${inputCls} resize-y`}
          />
        </div>
      </section>

      {/* Insumos */}
      <section className="bg-card border border-border rounded-lg p-5 space-y-4 mb-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-primary" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Insumos</h2>
          </div>
          <button
            type="button"
            onClick={addInsumo}
            disabled={!canAddInsumos}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            <Plus className="size-3.5" strokeWidth={2} />
            Agregar insumo
          </button>
        </div>

        {!canAddInsumos ? (
          <p className="text-sm text-muted-foreground">
            Seleccioná productor, campaña, labor y lotes con producción y cultivo (o creá la producción en la fila) para habilitar los insumos.
          </p>
        ) : insumoRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay insumos agregados todavía.</p>
        ) : (
          <div className="space-y-3">
            {insumoRows.map((row) => (
              <div key={row.tempId} className="grid grid-cols-1 sm:grid-cols-[minmax(140px,1fr)_80px_120px_120px_auto] gap-2 items-end">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    Insumo
                  </label>
                  <div className="flex gap-1.5 items-center">
                    <SelectAutocomplete
                      className="flex-1 min-w-0"
                      value={row.idInsumo}
                      onChange={(v) =>
                        setInsumoRows((rows) =>
                          rows.map((r) => (r.tempId === row.tempId ? { ...r, idInsumo: Number(v) } : r))
                        )
                      }
                      options={insumos.map((i) => ({ value: i.id, label: i.nombre }))}
                      placeholder="Elegí…"
                      renderTag={(opt) => {
                        const i = insumos.find((x) => x.id === Number(opt.value))
                        return i?.categoria ? (
                          <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorCategoria(i.idCategoria, categoriasInsumo)}`}>
                            {i.categoria.nombre}
                          </span>
                        ) : null
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => { setInsumoForRow(row.tempId); setShowInsumoModal(true) }}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 cursor-pointer"
                      title="Crear nuevo insumo"
                      aria-label="Crear nuevo insumo"
                    >
                      <Plus className="size-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    Unidad
                  </label>
                  <p className="text-sm text-foreground py-2">
                    {row.idInsumo !== ''
                      ? insumos.find((i) => i.id === Number(row.idInsumo))?.unidad || '—'
                      : '—'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    Cantidad / ha
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.cantidadPorHa}
                    onChange={(e) => updatePorHa(row.tempId, e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    Cantidad total
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.cantidadTotal}
                    onChange={(e) => updateTotal(row.tempId, e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeInsumo(row.tempId)}
                  className="p-2 rounded-md text-destructive hover:bg-destructive-soft self-end cursor-pointer"
                  aria-label="Eliminar insumo"
                >
                  <Trash2 className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground px-0.5">
              Total = cantidad/ha × {totalHaNum || 0} ha. Editar un campo recalcula el otro.
            </p>
          </div>
        )}
      </section>

      {/* Acciones: barra fija al fondo, siempre visible */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur-sm print-hide">
        <div className="max-w-4xl mx-auto flex justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/prescripciones')}
            className="px-4 py-2 cursor-pointer border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="inline-flex cursor-pointer items-center justify-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? 'Guardando…' : 'Guardar prescripción'}
          </button>
        </div>
      </div>

      {/* Modal: crear producción */}
      {showCampaniaModal && idEmpresa !== '' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => { if (!creandoCampania) setShowCampaniaModal(false) }} aria-hidden />
          <div className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">
                <Building2 className="size-4 inline mr-2 text-primary" strokeWidth={1.75} />
                Nueva producción
              </h2>
              <button onClick={() => { if (!creandoCampania) setShowCampaniaModal(false) }} disabled={creandoCampania} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50" aria-label="Cerrar">
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Campaña</label>
                <select
                  value={campaniaForm.campania}
                  onChange={(e) => setCampaniaForm({ ...campaniaForm, campania: e.target.value })}
                  className={inputCls}
                >
                  <option value="" disabled>Seleccionar período...</option>
                  {periodosCampania().map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <SelectAutocomplete
                label="Campo"
                value={campaniaForm.idCampo}
                onChange={(v) =>
                  setCampaniaForm((f) => ({ ...f, idCampo: v === '' ? '' : Number(v), idLote: '' }))
                }
                options={camposModal}
                placeholder="Todos los campos"
                clearable
              />
              <div className="space-y-1.5">
                <label className={labelCls}>Lote</label>
                <select
                  value={campaniaForm.idLote}
                  onChange={(e) => setCampaniaForm({ ...campaniaForm, idLote: e.target.value === '' ? '' : Number(e.target.value) })}
                  className={inputCls}
                >
                  <option value="">Seleccionar lote...</option>
                  {lotesModal.map((l) => (
                    <option key={l.id} value={l.id}>{l.descripcion || `Lote #${l.id}`}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Cultivo</label>
                <select
                  value={campaniaForm.idCultivo}
                  onChange={(e) => setCampaniaForm({ ...campaniaForm, idCultivo: e.target.value === '' ? '' : Number(e.target.value), idVariedad: '' })}
                  className={inputCls}
                >
                  <option value="">Seleccionar cultivo...</option>
                  {cultivos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Variedad</label>
                <select
                  value={campaniaForm.idVariedad}
                  onChange={(e) => setCampaniaForm({ ...campaniaForm, idVariedad: e.target.value === '' ? '' : Number(e.target.value) })}
                  disabled={campaniaForm.idCultivo === ''}
                  className={inputCls}
                >
                  <option value="">{campaniaForm.idCultivo === '' ? 'Elegí cultivo' : 'Sin variedad'}</option>
                  {variedadesModal.map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Superficie sembrada (ha)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={campaniaForm.supSembrada}
                  onChange={(e) => setCampaniaForm({ ...campaniaForm, supSembrada: fmtInputDecimal(e.target.value) })}
                  placeholder="0,00"
                  className={inputCls}
                />
                <p className="text-[11px] text-muted-foreground">Opcional. Sirve de superficie por defecto para aplicar en esta prescripción.</p>
              </div>
              {campaniaError && (
                <p className="text-[12px] w-full text-destructive inline-flex items-center gap-1 bg-destructive-soft border border-destructive/20 rounded-md px-3 py-2">
                  <AlertCircle className="size-3 shrink-0" strokeWidth={1.75} />
                  {campaniaError}
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCampaniaModal(false)}
                  disabled={creandoCampania}
                  className="flex-1 cursor-pointer px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={creandoCampania || campaniaForm.idLote === '' || campaniaForm.idCultivo === ''}
                  onClick={handleCreateCampania}
                  className="inline-flex flex-1 items-center justify-center gap-2 cursor-pointer px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creandoCampania && <Loader2 className="size-4 animate-spin" />}
                  {creandoCampania ? 'Creando…' : 'Crear campaña'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: nuevo insumo (compartido) */}
      {showInsumoModal && (
        <NuevoInsumoModal
          empresaId={idEmpresa === '' ? null : Number(idEmpresa)}
          empresaNombre={empresasVisibles.find((e) => e.id === Number(idEmpresa))?.nombre}
          isAdmin={isAdmin}
          onCreated={(insumo) => {
            if (insumoForRow != null) {
              setInsumoRows((rows) => rows.map((r) => (r.tempId === insumoForRow ? { ...r, idInsumo: insumo.id } : r)))
            }
            mutateInsumos()
            setShowInsumoModal(false)
            setInsumoForRow(null)
          }}
          onClose={() => { setShowInsumoModal(false); setInsumoForRow(null) }}
        />
      )}

      {/* Modal: detalle de la producción en solo lectura (por fila de lote) */}
      {produccionModalId != null && (
        <ProduccionDetalleModal
          campaniaId={produccionModalId}
          onClose={() => setProduccionModalId(null)}
        />
      )}
    </div>
  )
}