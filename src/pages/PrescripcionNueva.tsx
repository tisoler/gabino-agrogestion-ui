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

  // Paso 1: productor + período + cultivo (comunes) y campos/lotes (múltiple).
  const [fecha, setFecha] = useState(todayLocalISO())
  const [idEmpresa, setIdEmpresa] = useState<number | ''>('')
  const [periodo, setPeriodo] = useState<string>('')
  const [idCultivo, setIdCultivo] = useState<number | ''>('')
  const [camposSel, setCamposSel] = useState<string[]>([])
  const [lotesSel, setLotesSel] = useState<string[]>([])
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

  // Cultivos con producción del productor en el período elegido.
  const cultivosDisponibles = useMemo(() => {
    const rows = periodo === '' ? [] : producciones.filter((p) => p.campania === periodo)
    const seen = new Map<number, string>()
    for (const p of rows) if (p.cultivo) seen.set(p.cultivo.id, p.cultivo.nombre)
    return Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([value, label]) => ({ value, label }))
  }, [producciones, periodo])

  // Producciones del productor en ese período + cultivo: de ahí salen los
  // campos y, filtrados por campo, los lotes. El catálogo de /lotes aporta el
  // campo de cada lote.
  const lotePorId = useMemo(() => new Map(lotes.map((l) => [l.id, l])), [lotes])

  const produccionesFiltro = useMemo(() => {
    if (periodo === '' || idCultivo === '') return []
    return producciones.filter(
      (p) => p.campania === periodo && p.cultivo?.id === Number(idCultivo)
    )
  }, [producciones, periodo, idCultivo])

  const camposOpciones = useMemo(() => {
    const seen = new Map<number, string>()
    let sinCampo = false
    for (const p of produccionesFiltro) {
      const l = p.lote ? lotePorId.get(p.lote.id) : undefined
      if (l?.campo) seen.set(l.campo.id, l.campo.nombre)
      else sinCampo = true
    }
    const opciones = Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([value, label]) => ({ value: String(value), label }))
    if (sinCampo) opciones.push({ value: '0', label: 'Sin campo' })
    return opciones
  }, [produccionesFiltro, lotePorId])

  // La lista de lotes se arma en función de los campos seleccionados.
  const lotesOpciones = useMemo(
    () =>
      produccionesFiltro
        .filter((p) => {
          if (!p.lote) return false
          if (camposSel.length === 0) return true
          const l = lotePorId.get(p.lote.id)
          return camposSel.includes(String(l?.idCampo ?? 0))
        })
        .map((p) => {
          const l = p.lote ? lotePorId.get(p.lote.id) : undefined
          return {
            value: String(p.lote!.id),
            label: p.lote!.descripcion || `Lote #${p.lote!.id}`,
            campoNombre: l?.campo?.nombre || 'Sin campo',
            campaniaId: p.id,
            supSembrada: p.totales?.supSembrada,
          }
        })
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [produccionesFiltro, camposSel, lotePorId]
  )

  // Selección vigente: se poda cuando el período/cultivo/campo dejan de
  // incluir lotes (Patrón lotesEfectivos).
  const lotesEfectivos = useMemo(
    () => lotesSel.filter((id) => lotesOpciones.some((o) => o.value === id)),
    [lotesSel, lotesOpciones]
  )

  const lotesSelData = useMemo(
    () => lotesOpciones.filter((o) => lotesEfectivos.includes(o.value)),
    [lotesOpciones, lotesEfectivos]
  )

  const supDeLote = useCallback(
    (o: { campaniaId: number; supSembrada?: number }): number => {
      const editada = supAplicada[o.campaniaId]
      if (editada != null) return num(editada)
      return o.supSembrada && o.supSembrada > 0 ? o.supSembrada : 0
    },
    [supAplicada]
  )

  const totalHaNum = useMemo(
    () => lotesSelData.reduce((acc, o) => acc + supDeLote(o), 0),
    [lotesSelData, supDeLote]
  )

  const lotesEmpresa = useMemo(
    () => (idEmpresa === '' ? [] : lotes.filter((l) => l.idEmpresa === Number(idEmpresa))),
    [lotes, idEmpresa]
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
    idEmpresa !== '' && periodo !== '' && idCultivo !== '' && idLabor !== '' &&
    lotesSelData.length > 0 && totalHaNum > 0

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

  // Superficie a aplicar de un lote: recalcula las cantidades de los insumos
  // contra el nuevo total (suma de lotes).
  const updateSup = (campaniaId: number, value: string) => {
    const clean = fmtInputDecimal(value)
    setSupAplicada((m) => ({ ...m, [campaniaId]: clean }))
    const nuevoTotal = lotesSelData.reduce(
      (acc, o) => acc + (o.campaniaId === campaniaId ? num(clean) : supDeLote(o)),
      0,
    )
    setInsumoRows((rows) => recomputeByTotalHa(rows, nuevoTotal))
  }

  // Toggle de lotes: limpia las superficies editadas de los lotes quitados.
  const toggleLotes = (next: string[]) => {
    setLotesSel(next)
    setSupAplicada((m) => {
      const vigentes = new Set(
        lotesOpciones.filter((o) => next.includes(o.value)).map((o) => o.campaniaId),
      )
      const limpio: Record<number, string> = {}
      for (const [k, v] of Object.entries(m)) {
        if (vigentes.has(Number(k))) limpio[Number(k)] = v
      }
      return limpio
    })
  }

  // Crear producción desde el modal
  const handleCreateCampania = async () => {
    setCampaniaError(null)
    try {
      const payload: Record<string, unknown> = {
        campania: campaniaForm.campania,
        idLote: Number(campaniaForm.idLote),
        idCultivo: Number(campaniaForm.idCultivo),
      }
      if (campaniaForm.idVariedad !== '') payload.idVariedad = Number(campaniaForm.idVariedad)
      const { data: nueva } = await api.post('/campanias', payload)
      // La cascada queda apuntando a la producción recién creada, con su lote
      // ya seleccionado.
      const loteNuevo = Number(campaniaForm.idLote)
      const campoNuevo = lotePorId.get(loteNuevo)?.idCampo ?? 0
      setPeriodo(campaniaForm.campania)
      setIdCultivo(campaniaForm.idCultivo)
      setCamposSel((s) => (s.includes(String(campoNuevo)) ? s : [...s, String(campoNuevo)]))
      await mutateProduccion()
      const id: number | undefined = (nueva as { id?: number })?.id
      setLotesSel((s) => {
        const key = String(loteNuevo)
        return s.includes(key) ? s : [...s, key]
      })
      if (id != null) setSupAplicada((m) => ({ ...m, [id]: m[id] ?? '' }))
      setShowCampaniaModal(false)
      setCampaniaError(null)
      setCampaniaForm({
        campania: periodosCampania()[0] || '',
        idCampo: '', idLote: '', idCultivo: '', idVariedad: '',
      })
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setCampaniaError(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo crear la producción.')
    }
  }

  const canSave =
    fecha !== '' && periodo !== '' && idCultivo !== '' && idLabor !== '' &&
    lotesSelData.length > 0 && lotesSelData.every((o) => supDeLote(o) > 0) &&
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
        lotes: lotesSelData.map((o) => ({
          idCampania: o.campaniaId,
          superficieAplicada: supDeLote(o),
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
              setIdCultivo('')
              setCamposSel([])
              setLotesSel([])
              setSupAplicada({})
            }}
            options={empresasVisibles.map((e) => ({ value: e.id, label: e.nombre }))}
            placeholder="Seleccionar productor..."
            autoSelectSingle
          />
        </div>

        {/* Producción: productor + campaña + cultivo + campos (múltiple) + lotes (múltiple) */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectAutocomplete
              label="Campaña"
              value={periodo}
              onChange={(v) => {
                setPeriodo(String(v))
                setIdCultivo('')
                setCamposSel([])
                setLotesSel([])
                setSupAplicada({})
              }}
              options={periodosDisponibles.map((p) => ({ value: p, label: p }))}
              placeholder={idEmpresa === '' ? 'Elegí primero el productor' : 'Seleccionar campaña...'}
              disabled={idEmpresa === ''}
              sort={{ by: 'alfabetico', direction: 'desc' }}
              autoSelectSingle
              defaultFirst
            />
            <SelectAutocomplete
              label="Cultivo"
              value={idCultivo}
              onChange={(v) => {
                setIdCultivo(Number(v))
                setCamposSel([])
              }}
              options={cultivosDisponibles}
              placeholder={periodo === '' ? 'Elegí campaña' : 'Seleccionar cultivo...'}
              disabled={periodo === ''}
              autoSelectSingle
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelCls}>Campo</label>
              <MultiselectFilter
                value={camposSel}
                opciones={camposOpciones}
                onChange={setCamposSel}
                placeholder="Todos los campos"
                etiqueta="campo"
                vacio="Elegí un cultivo primero."
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Lotes</label>
              <MultiselectFilter
                value={lotesEfectivos}
                opciones={lotesOpciones.map((o) => ({ value: o.value, label: o.label }))}
                onChange={toggleLotes}
                placeholder={periodo === '' || idCultivo === '' ? 'Elegí campaña y cultivo' : 'Seleccionar lotes...'}
                etiqueta="lote"
                vacio="No hay lotes para esa combinación."
              />
            </div>
          </div>

          {idEmpresa === '' ? (
            <p className="text-[12px] text-muted-foreground">Elegí primero el productor.</p>
          ) : loadingProduccion ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Cargando producciones...</span>
            </div>
          ) : periodo === '' ? (
            periodosDisponibles.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No existe una producción para esa combinación. Creala para continuar.
              </p>
            ) : (
              <p className="text-[12px] text-muted-foreground">Elegí una campaña.</p>
            )
          ) : idCultivo === '' ? (
            cultivosDisponibles.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No existe una producción para esa combinación. Creala para continuar.
              </p>
            ) : (
              <p className="text-[12px] text-muted-foreground">Elegí un cultivo.</p>
            )
          ) : lotesSelData.length === 0 ? (
            lotesOpciones.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No existe una producción para esa combinación. Creala para continuar.
              </p>
            ) : (
              <p className="text-[12px] text-muted-foreground">Elegí al menos un lote.</p>
            )
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-success">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="font-medium">
                  {lotesSelData.length === 1 ? 'Lote seleccionado' : `${lotesSelData.length} lotes seleccionados`},{' '}
                  <span className="text-primary font-semibold">
                    total a aplicar: {fmtHa(totalHaNum)}
                  </span>
                  . Ajustá la superficie de cada lote e ingresá la labor.
                </span>
              </div>
            </div>
          )}

          {/* Superficie a aplicar por lote */}
          {lotesSelData.length > 0 && (
            <div className="overflow-x-auto border border-border rounded-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campo</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lote</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sup. sembrada</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sup. a aplicar (ha)</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-10" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lotesSelData.map((o) => {
                    const editada = supAplicada[o.campaniaId]
                    const defecto = o.supSembrada && o.supSembrada > 0 ? fmtNumValue(o.supSembrada) : ''
                    return (
                      <tr key={o.campaniaId}>
                        <td className="px-4 py-2 text-foreground">{o.campoNombre}</td>
                        <td className="px-4 py-2 font-medium text-foreground">{o.label}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                          {o.supSembrada != null && o.supSembrada > 0
                            ? o.supSembrada.toLocaleString('es-AR', { maximumFractionDigits: 2 })
                            : '—'}
                        </td>
                        <td className="px-4 py-2 w-36">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editada != null ? editada : defecto}
                            onChange={(e) => updateSup(o.campaniaId, e.target.value)}
                            placeholder="0,00"
                            className={inputCls + ' text-right'}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setProduccionModalId(o.campaniaId)}
                            className="inline-flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                            title="Ver datos de la producción"
                            aria-label={`Ver producción de ${o.label}`}
                          >
                            <Eye className="size-4" strokeWidth={1.75} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/10">
                    <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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

          <button
            type="button"
            onClick={() => {
              setCampaniaError(null)
              setCampaniaForm((f) => ({
                ...f,
                campania: periodo || periodosCampania()[0] || '',
                idCultivo: idCultivo === '' ? f.idCultivo : Number(idCultivo),
              }))
              setShowCampaniaModal(true)
            }}
            disabled={idEmpresa === ''}
            title={idEmpresa === '' ? 'Elegí primero el productor' : undefined}
            className="inline-flex mt-3 cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline"
          >
            <FolderPlus className="size-4.5" strokeWidth={1.75} />
            Agregar producción
          </button>
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
            Seleccioná productor, campaña, cultivo, labor y al menos un lote con superficie para habilitar los insumos.
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
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setShowCampaniaModal(false)} aria-hidden />
          <div className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">
                <Building2 className="size-4 inline mr-2 text-primary" strokeWidth={1.75} />
                Nueva producción
              </h2>
              <button onClick={() => setShowCampaniaModal(false)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent" aria-label="Cerrar">
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
                  className="flex-1 cursor-pointer px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={campaniaForm.idLote === '' || campaniaForm.idCultivo === ''}
                  onClick={handleCreateCampania}
                  className="flex-1 cursor-pointer px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Crear campaña
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