import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, AlertCircle, Activity, ClipboardList, MapPin, Calendar,
  Pickaxe, Package, Building2,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { fmtFecha, fmtHa, type PrescripcionListItem } from '../lib/prescripciones'
import { periodosCampania } from '../lib/campanias'
import MultiselectFilter from '../components/MultiselectFilter'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

interface CampaniaOption {
  id: number
  nombre: string
  campania?: string
  lote?: { id: number; descripcion: string | null; idEmpresa: number } | null
}
interface Lote {
  id: number
  idEmpresa: number
  descripcion: string | null
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
  const [filterIdCampania, setFilterIdCampania] = useState<number | null>(null)
  const [filterCampanias, setFilterCampanias] = useState<string[]>([])
  const [filterIdLote, setFilterIdLote] = useState<number | null>(null)
  const [filterIdLabor, setFilterIdLabor] = useState<number | null>(null)
  const [filterIdInsumo, setFilterIdInsumo] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Catálogos para los selects de filtro
  const { data: campanias = [] } = useSWR<CampaniaOption[]>(canRead ? '/campanias' : null, fetcher)
  const { data: lotes = [] } = useSWR<Lote[]>(canRead ? '/lotes' : null, fetcher)
  const { data: labores = [] } = useSWR<Labor[]>(canRead ? ['/labores', 'all'] : null, () =>
    api.get('/labores', { params: { all: true } }).then((r) => r.data))
  const { data: insumos = [] } = useSWR<Insumo[]>(canRead ? ['/insumos', 'all'] : null, () =>
    api.get('/insumos', { params: { all: true } }).then((r) => r.data))

  const campaniasFiltradas = useMemo(() => {
    if (filterEmpresaIds.length === 0) return campanias
    return campanias.filter((c) => c.lote?.idEmpresa != null && filterEmpresaIds.includes(c.lote.idEmpresa))
  }, [campanias, filterEmpresaIds])

  const lotesFiltrados = useMemo(() => {
    if (filterEmpresaIds.length === 0) return lotes
    return lotes.filter((l) => filterEmpresaIds.includes(l.idEmpresa))
  }, [lotes, filterEmpresaIds])

  const prescripcionesFetcher = async ([
    , empresaIds, idCampania, campanias, idLote, idLabor, idInsumo,
  ]: [string, string, number | null, string, number | null, number | null, number | null]) => {
    const params: Record<string, unknown> = {}
    if (empresaIds) params.empresaIds = empresaIds
    if (idCampania) params.idCampania = idCampania
    if (campanias) params.campanias = campanias
    if (idLote) params.idLote = idLote
    if (idLabor) params.idLabor = idLabor
    if (idInsumo) params.idInsumo = idInsumo
    const res = await api.get('/prescripciones', { params })
    return res.data as PrescripcionListItem[]
  }

  const { data: prescripciones = [], isLoading } = useSWR<PrescripcionListItem[]>(
    canRead
      ? ['prescripciones', filterEmpresaIds.join(','), filterIdCampania, filterCampanias.join(','), filterIdLote, filterIdLabor, filterIdInsumo]
      : null,
    prescripcionesFetcher,
    { revalidateOnFocus: true, revalidateOnMount: true, dedupingInterval: 0 }
  )

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return prescripciones
    return prescripciones.filter((p) =>
      p.campania?.nombre.toLowerCase().includes(term) ||
      (p.campania?.campania || '').toLowerCase().includes(term) ||
      p.labor?.nombre.toLowerCase().includes(term) ||
      (p.campania?.lote?.descripcion || '').toLowerCase().includes(term)
    )
  }, [prescripciones, searchTerm])

  const hasActiveFilters =
    filterEmpresaIds.length > 0 || filterIdCampania !== null || filterCampanias.length > 0 ||
    filterIdLote !== null || filterIdLabor !== null || filterIdInsumo !== null

  const clearFilters = () => {
    setFilterEmpresaIds([])
    setFilterIdCampania(null)
    setFilterCampanias([])
    setFilterIdLote(null)
    setFilterIdLabor(null)
    setFilterIdInsumo(null)
  }

  const goToDetail = (id: number) => navigate(`/prescripciones/${id}`)
  const goToCreate = () => navigate('/prescripciones/nueva')

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
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
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
            placeholder="Buscar por producción, campaña, labor o lote..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Producción
            </label>
            <select
              value={filterIdCampania ?? ''}
              onChange={(e) => setFilterIdCampania(e.target.value === '' ? null : Number(e.target.value))}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
            >
              <option value="">Todas</option>
              {campaniasFiltradas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
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
              Lote
            </label>
            <select
              value={filterIdLote ?? ''}
              onChange={(e) => setFilterIdLote(e.target.value === '' ? null : Number(e.target.value))}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
            >
              <option value="">Todos</option>
              {lotesFiltrados.map((l) => (
                <option key={l.id} value={l.id}>{l.descripcion || `Lote #${l.id}`}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Labor
            </label>
            <select
              value={filterIdLabor ?? ''}
              onChange={(e) => setFilterIdLabor(e.target.value === '' ? null : Number(e.target.value))}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
            >
              <option value="">Todas</option>
              {labores.map((l) => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Insumo
            </label>
            <select
              value={filterIdInsumo ?? ''}
              onChange={(e) => setFilterIdInsumo(e.target.value === '' ? null : Number(e.target.value))}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
            >
              <option value="">Todos</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </select>
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
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Producción
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Productor
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Campaña
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => goToDetail(p.id)}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <span className="text-sm text-foreground">{fmtFecha(p.fecha)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground truncate">
                        {p.campania?.nombre || `Producción #${p.idCampania}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Building2 className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <span className="text-sm text-foreground truncate">
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
                      <div className="flex items-center gap-1.5 min-w-0">
                        <MapPin className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <span className="text-sm text-foreground truncate">
                          {p.campania?.lote?.descripcion || `Lote #${p.campania?.lote?.id ?? '—'}`}
                        </span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
