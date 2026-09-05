import { useState, useMemo } from 'react'
import useSWR, { mutate } from 'swr'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, AlertCircle, Activity, ClipboardList, MapPin, Calendar,
  Pickaxe, Package, Building2, Loader2, X,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { fmtFecha, fmtHa, type PrescripcionListItem } from '../lib/prescripciones'
import { periodosCampania } from '../lib/campanias'
import MultiselectFilter from '../components/MultiselectFilter'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

interface Lote {
  id: number
  idEmpresa: number
  descripcion: string | null
  idCampo?: number | null
  campo?: { id: number; nombre: string } | null
}
interface Labor {
  id: number
  nombre: string
}
interface Insumo {
  id: number
  nombre: string
}

export default function Prescripciones() {
  const navigate = useNavigate()
  const { permisos, isSysAdmin, isAsesorAdmin, user, empresas } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const canRead = permisos.includes('lectura:prescripcion')
  const canWrite = permisos.includes('escritura:prescripcion')

  const empresasVisibles = useMemo(() => {
    if (isAdmin) return empresas
    const ids = (user?.idEmpresas || []).map(Number)
    return empresas.filter((e) => ids.includes(e.id))
  }, [isAdmin, user, empresas])

  // Filtros
  const [filterEmpresaIds, setFilterEmpresaIds] = useState<number[]>([])
  const [filterCampanias, setFilterCampanias] = useState<string[]>([])
  const [filterCampoIds, setFilterCampoIds] = useState<number[]>([])
  const [filterLoteIds, setFilterLoteIds] = useState<number[]>([])
  const [filterLaborIds, setFilterLaborIds] = useState<number[]>([])
  const [filterInsumoIds, setFilterInsumoIds] = useState<number[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  // Catálogos para los selects de filtro
  const { data: lotes = [] } = useSWR<Lote[]>(canRead ? '/lotes' : null, fetcher)
  const { data: labores = [] } = useSWR<Labor[]>(canRead ? ['/labores', 'all'] : null, () =>
    api.get('/labores', { params: { all: true } }).then((r) => r.data))
  const { data: insumos = [] } = useSWR<Insumo[]>(canRead ? ['/insumos', 'all'] : null, () =>
    api.get('/insumos', { params: { all: true } }).then((r) => r.data))

  // Lotes del productor filtrado; los campos salen de ahí y el campo filtra los lotes.
  const lotesDeProductor = useMemo(() => {
    if (filterEmpresaIds.length === 0) return lotes
    return lotes.filter((l) => filterEmpresaIds.includes(l.idEmpresa))
  }, [lotes, filterEmpresaIds])

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

  // El campo seleccionado filtra la lista de lotes del filtro.
  const lotesFiltrados = useMemo(() => {
    if (filterCampoIds.length === 0) return lotesDeProductor
    const sinCampo = filterCampoIds.includes(0)
    const campos = new Set(filterCampoIds.filter((n) => n !== 0))
    return lotesDeProductor.filter((l) => {
      const lc = l.idCampo ?? null
      if (lc == null) return sinCampo
      return campos.has(lc)
    })
  }, [lotesDeProductor, filterCampoIds])

  // Solo conserva lotes que sigan existiendo en las opciones (el campo puede
  // haber quitado lotes de la lista del filtro).
  const lotesEfectivos = useMemo(
    () => filterLoteIds.filter((id) => lotesFiltrados.some((l) => l.id === id)),
    [filterLoteIds, lotesFiltrados]
  )

  const prescripcionesFetcher = async ([
    , empresaIds, campanias, campos, lotes, labores, insumos,
  ]: [string, string, string, string, string, string, string]) => {
    const params: Record<string, unknown> = {}
    if (empresaIds) params.empresaIds = empresaIds
    if (campanias) params.campanias = campanias
    if (campos) params.idCampo = campos
    if (lotes) params.idLote = lotes
    if (labores) params.idLabor = labores
    if (insumos) params.idInsumo = insumos
    const res = await api.get('/prescripciones', { params })
    return res.data as PrescripcionListItem[]
  }

  const { data: prescripciones = [], isLoading, mutate: revalidarPrescripciones } = useSWR<PrescripcionListItem[]>(
    canRead
      ? ['prescripciones', filterEmpresaIds.join(','), filterCampanias.join(','), filterCampoIds.join(','), lotesEfectivos.join(','), filterLaborIds.join(','), filterInsumoIds.join(',')]
      : null,
    prescripcionesFetcher,
    { revalidateOnFocus: false, revalidateOnMount: true, dedupingInterval: 0 }
  )

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return prescripciones
    return prescripciones.filter((p) =>
      (empresas.find((e) => e.id === p.campania?.lote?.idEmpresa)?.nombre || '').toLowerCase().includes(term) ||
      (p.campania?.lote?.campo?.nombre || '').toLowerCase().includes(term) ||
      (p.campania?.lote?.descripcion || '').toLowerCase().includes(term) ||
      (p.labor?.nombre || '').toLowerCase().includes(term)
    )
  }, [prescripciones, searchTerm, empresas])

  const hasActiveFilters =
    filterEmpresaIds.length > 0 || filterCampanias.length > 0 ||
    filterCampoIds.length > 0 || lotesEfectivos.length > 0 ||
    filterLaborIds.length > 0 || filterInsumoIds.length > 0

  const clearFilters = () => {
    setFilterEmpresaIds([])
    setFilterCampanias([])
    setFilterCampoIds([])
    setFilterLoteIds([])
    setFilterLaborIds([])
    setFilterInsumoIds([])
  }

  const goToDetail = (id: number) => navigate(`/prescripciones/${id}`)
  const goToCreate = () => navigate('/prescripciones/nueva')

  // Anular / recuperar (borrado lógico) con confirmación
  const [confirmTarget, setConfirmTarget] = useState<PrescripcionListItem | null>(null)
  const [annulBusy, setAnnulBusy] = useState(false)
  const [annulError, setAnnulError] = useState<string | null>(null)

  const handleToggleAnulada = async () => {
    if (!confirmTarget || annulBusy) return
    setAnnulBusy(true)
    setAnnulError(null)
    try {
      await api.patch(`/prescripciones/${confirmTarget.id}/anulada`, {
        anulada: !confirmTarget.anulada,
      })
      setConfirmTarget(null)
      await revalidarPrescripciones()
      // Anular/recuperar agrega o quita labor/insumos a la producción
      // (campania_insumo / campania_labor): revalidar la cache SWR de
      // producciones (listado "campanias" y detalle /campanias/{id}).
      await mutate(
        (key) =>
          (typeof key === 'string' && key.startsWith('/campanias')) ||
          (Array.isArray(key) && key[0] === 'campanias'),
        undefined,
        { revalidate: true },
      )
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      const detalle = Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : ''
      setAnnulError(
        detalle || (e instanceof Error ? e.message : 'No se pudo actualizar la prescripción.'),
      )
    } finally {
      setAnnulBusy(false)
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
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Prescripciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Recetas de aplicación por labor e insumos sobre una producción
          </p>
        </div>
        {canWrite && (
          <button
            onClick={goToCreate}
            className="inline-flex cursor-pointer items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nueva Prescripción</span>
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-card/60 border border-border rounded-lg p-3 space-y-3">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Buscar por productor, campo, lote o labor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2.5">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Productor
            </label>
            <MultiselectFilter
              value={filterEmpresaIds.map(String)}
              opciones={empresasVisibles.map((e) => ({ value: String(e.id), label: e.nombre }))}
              onChange={(next) => setFilterEmpresaIds(next.map(Number))}
              placeholder="Todos"
              etiqueta="productor"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Campaña
            </label>
            <MultiselectFilter
              value={filterCampanias}
              opciones={periodosCampania().map((p) => ({ value: p, label: p }))}
              onChange={setFilterCampanias}
              placeholder="Todas"
              etiqueta="período"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Campo
            </label>
            <MultiselectFilter
              value={filterCampoIds.map(String)}
              opciones={camposDisponibles.map((c) => ({ value: String(c.value), label: c.label }))}
              onChange={(next) => setFilterCampoIds(next.map(Number))}
              placeholder="Todos"
              etiqueta="campo"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Lote
            </label>
            <MultiselectFilter
              value={lotesEfectivos.map(String)}
              opciones={lotesFiltrados.map((l) => ({ value: String(l.id), label: l.descripcion || `Lote #${l.id}` }))}
              onChange={(next) => setFilterLoteIds(next.map(Number))}
              placeholder="Todos"
              etiqueta="lote"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Labor
            </label>
            <MultiselectFilter
              value={filterLaborIds.map(String)}
              opciones={labores.map((l) => ({ value: String(l.id), label: l.nombre }))}
              onChange={(next) => setFilterLaborIds(next.map(Number))}
              placeholder="Todas"
              etiqueta="labor"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Insumo
            </label>
            <MultiselectFilter
              value={filterInsumoIds.map(String)}
              opciones={insumos.map((i) => ({ value: String(i.id), label: i.nombre }))}
              onChange={(next) => setFilterInsumoIds(next.map(Number))}
              placeholder="Todos"
              etiqueta="insumo"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <button
              onClick={clearFilters}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <AlertCircle className="size-3" strokeWidth={2} />
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Grilla */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando prescripciones...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <ClipboardList className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground mb-1">No hay prescripciones cargadas.</p>
          {canWrite && (
            <button
              onClick={goToCreate}
              className="text-sm font-medium text-primary hover:underline mt-1"
            >
              Crear la primera prescripción
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {filtered.map((p) => (
              <div
                key={p.id}
                onClick={() => goToDetail(p.id)}
                className={`bg-card border border-border rounded-lg p-4 space-y-3 cursor-pointer transition-colors hover:bg-muted/40 ${p.anulada ? 'bg-muted/40 opacity-75' : ''}`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-semibold text-foreground leading-tight truncate">
                        {p.campania?.lote?.descripcion || `Lote #${p.campania?.lote?.id ?? '—'}`}
                        {(p.lotesCount ?? 0) > 1 && (
                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary text-[10px] font-semibold">
                            +{(p.lotesCount ?? 0) - 1}
                          </span>
                        )}
                        <span className="font-normal text-muted-foreground">
                          {p.campania?.campania ? ` · ${p.campania.campania}` : ''}
                        </span>
                      </h3>
                      {p.anulada && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-destructive/10 text-destructive border border-destructive/20 rounded text-[10px] font-semibold uppercase tracking-wider">
                          Anulada
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-sm text-muted-foreground">
                      <Calendar className="size-3.5" strokeWidth={1.75} />
                      {fmtFecha(p.fecha)}
                    </div>
                  </div>
                  {canWrite && (
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <button
                        onClick={() => { setAnnulError(null); setConfirmTarget(p) }}
                        className={`inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${p.anulada
                          ? 'text-primary border-primary/30 hover:bg-primary/10'
                          : 'text-destructive border-destructive/30 hover:bg-destructive/10'
                          }`}
                      >
                        {p.anulada ? 'Recuperar' : 'Anular'}
                      </button>
                    </div>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Productor</dt>
                    <dd className="text-foreground truncate">
                      {empresas.find((e) => e.id === p.campania?.lote?.idEmpresa)?.nombre
                        || `Productor #${p.campania?.lote?.idEmpresa ?? '—'}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campaña</dt>
                    <dd className="text-foreground">{p.campania?.campania || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campo</dt>
                    <dd className="text-foreground truncate">{p.campania?.lote?.campo?.nombre || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lote</dt>
                    <dd className="text-foreground truncate">
                      {p.campania?.lote?.descripcion || `Lote #${p.campania?.lote?.id ?? '—'}`}
                      {(p.lotesCount ?? 0) > 1 && (
                        <span className="font-normal text-muted-foreground"> +{(p.lotesCount ?? 0) - 1}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Labor</dt>
                    <dd className="text-foreground truncate">{p.labor?.nombre || `Labor #${p.idLabor}`}</dd>
                  </div>
                </dl>

                <div className="pt-2 border-t border-border flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total {fmtHa(p.totalHaAplicacion)}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent border border-border rounded text-[11px] font-medium text-foreground">
                    <Package className="size-3" strokeWidth={1.75} />
                    {p.insumoCount} {p.insumoCount === 1 ? 'insumo' : 'insumos'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden sm:block bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Fecha
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Productor
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Campaña
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Campo
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Lote
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Labor
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                      Total ha
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                      Insumos
                    </th>
                    {canWrite && (
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                        Acciones
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => goToDetail(p.id)}
                      className={`cursor-pointer transition-colors ${p.anulada ? 'bg-destructive/10 hover:bg-destructive/20 text-muted-foreground' : 'hover:bg-muted/40'}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm text-foreground">{fmtFecha(p.fecha)}</span>
                        </div>
                        {p.anulada && (
                          <span className="mt-1 inline-flex items-center px-1.5 py-0.5 bg-destructive/10 text-destructive border border-destructive/20 rounded text-[9px] font-semibold uppercase tracking-wider">
                            Anulada
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm text-foreground line-clamp-2 leading-tight">
                            {empresas.find((e) => e.id === p.campania?.lote?.idEmpresa)?.nombre
                              || `Productor #${p.campania?.lote?.idEmpresa ?? '—'}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">
                          {p.campania?.campania || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">
                          {p.campania?.lote?.campo?.nombre || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MapPin className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm text-foreground truncate">
                            {p.campania?.lote?.descripcion || `Lote #${p.campania?.lote?.id ?? '—'}`}
                          </span>
                          {(p.lotesCount ?? 0) > 1 && (
                            <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
                              +{(p.lotesCount ?? 0) - 1}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Pickaxe className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm text-foreground truncate">
                            {p.labor?.nombre || `Labor #${p.idLabor}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm">{fmtHa(p.totalHaAplicacion)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent border border-border rounded text-[11px] font-medium text-foreground">
                          <Package className="size-3" strokeWidth={1.75} />
                          {p.insumoCount}
                        </span>
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => { setAnnulError(null); setConfirmTarget(p) }}
                            disabled={!canWrite}
                            className={`inline-flex cursor-pointer items-center px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white ${p.anulada
                              ? 'text-primary border-primary/30 hover:bg-primary/10'
                              : 'text-destructive border-destructive/30 hover:bg-destructive/10'
                              }`}
                          >
                            {p.anulada ? 'Recuperar' : 'Anular'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmación: anular / recuperar */}
      {confirmTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => !annulBusy && setConfirmTarget(null)}
            aria-hidden
          />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">
                {confirmTarget.anulada ? 'Recuperar prescripción' : 'Anular prescripción'}
              </h2>
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={annulBusy}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-foreground">
                {confirmTarget.anulada
                  ? `¿Desea recuperar la prescripción #${confirmTarget.id}?`
                  : `¿Desea anular la prescripción #${confirmTarget.id}?`}
              </p>
              {annulError && (
                <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                  <AlertCircle className="size-3" strokeWidth={1.75} />
                  {annulError}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmTarget(null)}
                  disabled={annulBusy}
                  className="flex-1 cursor-pointer px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={annulBusy}
                  onClick={handleToggleAnulada}
                  className={`flex-1 cursor-pointer px-4 py-2 rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2 ${confirmTarget.anulada
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-destructive text-destructive-foreground'
                    }`}
                >
                  {annulBusy && <Loader2 className="size-4 animate-spin" />}
                  {annulBusy
                    ? 'Procesando…'
                    : confirmTarget.anulada
                      ? 'Recuperar'
                      : 'Anular'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
