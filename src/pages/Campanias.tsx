import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Filter, Calendar, Activity, AlertCircle, Shield,
  ChevronDown, Check, X, FileSpreadsheet, MapPin, Sprout, Layers
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { fmtMoneda, fmtNumero, fmtQQHa, periodosCampania } from '../lib/campanias'

interface CampaniaListTotales {
  rendimientoQqHa: number
  margenBrutoSAlquilerHa: number
  margenBrutoSAlquilerLote: number
  supSembrada: number
  supCosechada: number
}

interface CampaniaListItem {
  id: number
  nombre: string
  campania: string
  idLote: number
  idCultivo: number
  idVariedad: number | null
  lote?: { id: number; descripcion: string | null; idEmpresa: number } | null
  cultivo?: { id: number; nombre: string } | null
  variedad?: { id: number; nombre: string } | null
  totales: CampaniaListTotales
}

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

export default function Campanias() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')

  const { permisos, isSysAdmin, isAsesorAdmin, user, empresas } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const canWrite = permisos.includes('escritura:campania')
  const canRead = permisos.includes('lectura:campania')
  const userEmpresas = (user?.idEmpresas || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)

  // Filtros
  // Sin filtro por defecto: admins ven todas las empresas y asesor/productor
  // todas las que tienen vinculadas (el backend filtra por idEmpresas).
  const [filterEmpresaId, setFilterEmpresaId] = useState<number | null>(null)
  const filterEmpresasVisibles = isAdmin ? empresas : empresas.filter((e) => userEmpresas.includes(e.id))
  const [filterCampanias, setFilterCampanias] = useState<string[]>([])
  const [filterIdCultivo, setFilterIdCultivo] = useState<number | null>(null)
  const [filterIdVariedad, setFilterIdVariedad] = useState<number | null>(null)
  const [filterIdLote, setFilterIdLote] = useState<number | null>(null)

  // UI
  const [showAll, setShowAll] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [campaniasMenuOpen, setCampaniasMenuOpen] = useState(false)

  // Catálogos para los selects de filtro y para la creación
  const { data: cultivos = [] } = useSWR<Cultivo[]>(canRead ? '/cultivos' : null, fetcher)
  const { data: lotes = [] } = useSWR<Lote[]>(canRead ? '/lotes' : null, fetcher)

  // Variedades filtradas por cultivo seleccionado en el filtro
  const variedadesFiltradas = useMemo(() => {
    if (!filterIdCultivo) return []
    const c = cultivos.find((x) => x.id === filterIdCultivo)
    return c?.variedades || []
  }, [cultivos, filterIdCultivo])

  // Lotes filtrados por empresa (para asesor/productor ya viene filtrado del backend;
  // para admins usamos el filtro de empresa seleccionado)
  const lotesFiltrados = useMemo(() => {
    if (!lotes) return []
    if (isAdmin && filterEmpresaId) {
      return lotes.filter((l) => l.idEmpresa === filterEmpresaId)
    }
    return lotes
  }, [lotes, isAdmin, filterEmpresaId])

  const campaniasFetcher = async ([
    ,
    empresaId,
    campanias,
    nombre,
    idCultivo,
    idVariedad,
    idLote,
  ]: [
      string,
      number | null,
      string,
      string,
      number | null,
      number | null,
      number | null
    ]) => {
    const params: Record<string, unknown> = {}
    if (empresaId) params.currentEmpresaId = empresaId
    if (campanias) params.campanias = campanias
    if (nombre) params.nombre = nombre
    if (idCultivo) params.idCultivo = idCultivo
    if (idVariedad) params.idVariedad = idVariedad
    if (idLote) params.idLote = idLote
    const res = await api.get('/campanias', { params })
    return res.data as CampaniaListItem[]
  }

  const { data: campanias = [], isLoading } = useSWR<CampaniaListItem[]>(
    canRead
      ? [
        'campanias',
        filterEmpresaId,
        filterCampanias.join(','),
        searchTerm,
        filterIdCultivo,
        filterIdVariedad,
        filterIdLote,
      ]
      : null,
    campaniasFetcher,
    { revalidateOnFocus: true, revalidateOnMount: true, dedupingInterval: 0 }
  )

  // Totales globales (para el header del dashboard)
  const totalesGlobales = useMemo(() => {
    const superficie = campanias.reduce((acc, c) => acc + (c.totales.supCosechada || 0), 0)
    const margen = campanias.reduce((acc, c) => acc + (c.totales.margenBrutoSAlquilerLote || 0), 0)
    return { superficie, margen, cantidad: campanias.length }
  }, [campanias])

  const clearFilters = () => {
    setFilterEmpresaId(null)
    setFilterCampanias([])
    setFilterIdCultivo(null)
    setFilterIdVariedad(null)
    setFilterIdLote(null)
  }

  const hasActiveFilters =
    filterEmpresaId !== null ||
    filterCampanias.length > 0 ||
    filterIdCultivo !== null ||
    filterIdVariedad !== null ||
    filterIdLote !== null

  const goToDetail = (id: number) => navigate(`/campanias/${id}`)
  const goToCreate = () => navigate('/campanias/nueva')

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tienes permisos para ver esta sección.</p>
      </div>
    )
  }

  const filterEmpresaLabel = empresas.find((e) => e.id === filterEmpresaId)?.nombre

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Campañas</h1>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                <Shield className="size-3" strokeWidth={2} />
                Admin
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cosechas, márgenes y costos por lote y campaña agrícola
          </p>
        </div>

        {canWrite && (
          <button
            onClick={goToCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nueva Campaña</span>
          </button>
        )}
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Campañas
          </p>
          <p className="text-2xl font-semibold text-foreground mt-1">{totalesGlobales.cantidad}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Superficie cosechada
          </p>
          <p className="text-2xl font-semibold text-foreground mt-1">
            {fmtNumero(totalesGlobales.superficie, 2)} <span className="text-base text-muted-foreground font-normal">ha</span>
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Margen bruto total
          </p>
          <p className={`text-2xl font-semibold mt-1 ${totalesGlobales.margen < 0 ? 'text-destructive' : 'text-success'}`}>
            {fmtMoneda(totalesGlobales.margen, 0)}
          </p>
        </div>
      </div>

      {/* Filtros */}
      {isAdmin && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <span
                role="switch"
                aria-checked={showAll}
                onClick={() => setShowAll(!showAll)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault()
                    setShowAll(!showAll)
                  }
                }}
                tabIndex={0}
                className={`relative inline-flex w-9 h-5 items-center rounded-full transition-colors ${showAll ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
              >
                <span
                  className={`inline-block size-4 rounded-full bg-white shadow transform transition-transform ${showAll ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                />
              </span>
              <span className="text-sm text-foreground">Ver todos los productores</span>
            </label>

            {showAll && (
              <div className="relative">
                <button
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent border border-border rounded-md text-xs font-medium text-foreground hover:bg-muted transition-colors"
                  aria-haspopup="menu"
                  aria-expanded={isFilterOpen}
                >
                  <Filter className="size-3.5" strokeWidth={2} />
                  <span>Productor</span>
                  <ChevronDown
                    className={`size-3.5 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`}
                    strokeWidth={2}
                  />
                </button>

                {isFilterOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setIsFilterOpen(false)}
                      aria-hidden
                    />
                    <div
                      role="menu"
                      className="absolute right-0 mt-1.5 w-64 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-40"
                    >
                      <div className="px-3 py-2 border-b border-border bg-accent/40">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Productores
                        </span>
                      </div>
                      <div className="max-h-60 overflow-y-auto p-1">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterEmpresaId(null)
                            setIsFilterOpen(false)
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-sm transition-colors ${filterEmpresaId === null
                            ? 'bg-primary-soft text-primary font-medium'
                            : 'text-foreground hover:bg-accent'
                            }`}
                        >
                          <span className="truncate">Todos</span>
                          {filterEmpresaId === null && <Check className="size-3.5 shrink-0" strokeWidth={2} />}
                        </button>
                        {empresas?.map((e) => (
                          <button
                            type="button"
                            key={e.id}
                            onClick={() => {
                              setFilterEmpresaId(e.id)
                              setIsFilterOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-sm transition-colors ${filterEmpresaId === e.id
                              ? 'bg-primary-soft text-primary font-medium'
                              : 'text-foreground hover:bg-accent'
                              }`}
                          >
                            <span className="truncate">{e.nombre}</span>
                            {filterEmpresaId === e.id && <Check className="size-3.5 shrink-0" strokeWidth={2} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {filterEmpresaLabel && (
            <p className="text-[11px] text-muted-foreground px-1">
              Filtrando por <span className="font-medium text-foreground">{filterEmpresaLabel}</span>
            </p>
          )}
        </div>
      )}

      {/* Búsqueda + filtros por año/cultivo/variedad/lote */}
      <div className="bg-card/60 border border-border rounded-lg p-3 space-y-3">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Buscar por nombre de campaña..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {!isAdmin && filterEmpresasVisibles.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                Productor
              </label>
              <select
                value={filterEmpresaId ?? ''}
                onChange={(e) => setFilterEmpresaId(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded-md text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
              >
                <option value="">Todos</option>
                {filterEmpresasVisibles.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Campaña
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCampaniasMenuOpen((o) => !o)}
                className="w-full inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-background border border-border rounded-md text-xs text-foreground hover:border-primary transition-colors"
                aria-haspopup="menu"
                aria-expanded={campaniasMenuOpen}
              >
                <span className={`truncate ${filterCampanias.length ? '' : 'text-muted-foreground'}`}>
                  {filterCampanias.length === 0
                    ? 'Todas'
                    : filterCampanias.length === 1
                      ? filterCampanias[0]
                      : `${filterCampanias.length} períodos`}
                </span>
                <ChevronDown
                  className={`size-3.5 shrink-0 transition-transform ${campaniasMenuOpen ? 'rotate-180' : ''}`}
                  strokeWidth={2}
                />
              </button>
              {campaniasMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setCampaniasMenuOpen(false)} aria-hidden />
                  <div role="menu" className="absolute z-40 mt-1 w-44 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                    <div className="max-h-60 overflow-y-auto p-1">
                      {periodosCampania().map((p) => (
                        <button
                          type="button"
                          key={p}
                          onClick={() =>
                            setFilterCampanias((prev) =>
                              prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                            )
                          }
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-xs transition-colors ${
                            filterCampanias.includes(p)
                              ? 'bg-primary-soft text-primary font-medium'
                              : 'text-foreground hover:bg-accent'
                          }`}
                        >
                          <span>{p}</span>
                          {filterCampanias.includes(p) && <Check className="size-3.5 shrink-0" strokeWidth={2} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Cultivo
            </label>
            <select
              value={filterIdCultivo ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                setFilterIdCultivo(v)
                setFilterIdVariedad(null)
              }}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-md text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
            >
              <option value="">Todos</option>
              {cultivos.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Variedad
            </label>
            <select
              value={filterIdVariedad ?? ''}
              onChange={(e) => setFilterIdVariedad(e.target.value === '' ? null : Number(e.target.value))}
              disabled={!filterIdCultivo}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-md text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors disabled:opacity-50"
            >
              <option value="">{filterIdCultivo ? 'Todas' : 'Elegí cultivo'}</option>
              {variedadesFiltradas.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Lote
            </label>
            <select
              value={filterIdLote ?? ''}
              onChange={(e) => setFilterIdLote(e.target.value === '' ? null : Number(e.target.value))}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-md text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
            >
              <option value="">Todos</option>
              {lotesFiltrados.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.descripcion || `Lote #${l.id}`}
                </option>
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
              <X className="size-3" strokeWidth={2} />
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Grilla */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando campañas...</p>
        </div>
      ) : campanias.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <FileSpreadsheet className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground mb-1">No hay campañas cargadas.</p>
          {canWrite && (
            <button
              onClick={goToCreate}
              className="text-sm font-medium text-primary hover:underline mt-1"
            >
              Crear la primera campaña
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
                    Campaña
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Lote
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Productor
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Cultivo / Variedad
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Período
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Sup. cos.
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Rend.
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Margen / ha
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Margen lote
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campanias.map((c) => {
                  const margenNegativo = c.totales.margenBrutoSAlquilerLote < 0
                  return (
                    <tr
                      key={c.id}
                      onClick={() => goToDetail(c.id)}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Calendar className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="font-medium text-foreground truncate">{c.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MapPin className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm text-foreground truncate">
                            {c.lote?.descripcion || `Lote #${c.idLote}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">
                          {empresas.find((e) => e.id === c.lote?.idEmpresa)?.nombre
                            || `Productor #${c.lote?.idEmpresa ?? '—'}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1 text-sm text-foreground">
                            <Sprout className="size-3 text-muted-foreground" strokeWidth={1.75} />
                            {c.cultivo?.nombre || `Cultivo #${c.idCultivo}`}
                          </span>
                          {c.variedad && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Layers className="size-2.5" strokeWidth={1.75} />
                              {c.variedad.nombre}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {c.campania}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtNumero(c.totales.supCosechada, 2)}
                        <span className="text-[10px] text-muted-foreground ml-0.5">ha</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm">
                        {fmtQQHa(c.totales.rendimientoQqHa, 2)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-sm font-medium ${margenNegativo ? 'text-destructive' : 'text-success'}`}>
                        {fmtMoneda(c.totales.margenBrutoSAlquilerHa, 0)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-sm font-medium ${margenNegativo ? 'text-destructive' : 'text-success'}`}>
                        {fmtMoneda(c.totales.margenBrutoSAlquilerLote, 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
