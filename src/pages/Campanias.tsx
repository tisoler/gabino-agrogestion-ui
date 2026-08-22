import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Activity, AlertCircle, Shield,
  X, FileSpreadsheet, MapPin, Sprout, Layers
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { fmtMoneda, fmtNumero, fmtQQHa, periodosCampania } from '../lib/campanias'
import MultiselectFilter from '../components/MultiselectFilter'

interface CampaniaListTotales {
  rendimientoQqHa: number
  margenBrutoSAlquilerHa: number
  margenBrutoSAlquilerLote: number
  supSembrada: number
  supCosechada: number
}

interface CampaniaListItem {
  id: number
  campania: string
  idLote: number
  idCultivo: number
  idVariedad: number | null
  lote?: {
    id: number
    descripcion: string | null
    idEmpresa: number
    campo?: { id: number; nombre: string } | null
  } | null
  cultivo?: { id: number; nombre: string } | null
  variedad?: { id: number; nombre: string } | null
  totales: CampaniaListTotales
}

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

export default function Campanias() {
  const navigate = useNavigate()

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
  const [filterEmpresaIds, setFilterEmpresaIds] = useState<number[]>([])
  const filterEmpresasVisibles = isAdmin ? empresas : empresas.filter((e) => userEmpresas.includes(e.id))
  const [filterCampanias, setFilterCampanias] = useState<string[]>([])
  const [filterCampoIds, setFilterCampoIds] = useState<number[]>([])
  const [filterLoteIds, setFilterLoteIds] = useState<number[]>([])
  const [filterCultivoIds, setFilterCultivoIds] = useState<number[]>([])
  const [filterVariedadIds, setFilterVariedadIds] = useState<number[]>([])

  // Catálogos para los selects de filtro y para la creación
  const { data: cultivos = [] } = useSWR<Cultivo[]>(canRead ? '/cultivos' : null, fetcher)
  const { data: lotes = [] } = useSWR<Lote[]>(canRead ? '/lotes' : null, fetcher)

  // Variedades de los cultivos seleccionados en el filtro
  const variedadesFiltradas = useMemo(() => {
    if (filterCultivoIds.length === 0) return []
    const seen = new Map<number, string>()
    for (const id of filterCultivoIds) {
      const c = cultivos.find((x) => x.id === id)
      for (const v of c?.variedades || []) seen.set(v.id, v.nombre)
    }
    return Array.from(seen.entries()).map(([id, nombre]) => ({ id, nombre }))
  }, [cultivos, filterCultivoIds])

  // Solo conserva variedades que pertenezcan a los cultivos seleccionados.
  const variedadIdsEfectivos = useMemo(
    () => filterVariedadIds.filter((id) => variedadesFiltradas.some((v) => v.id === id)),
    [filterVariedadIds, variedadesFiltradas]
  )

  // Lotes del productor seleccionado
  const lotesDeProductor = useMemo(() => {
    if (!lotes) return []
    if (filterEmpresaIds.length > 0) {
      return lotes.filter((l) => filterEmpresaIds.includes(l.idEmpresa))
    }
    return lotes
  }, [lotes, filterEmpresaIds])

  // Campos de los lotes del filtro de productor (incluye "Sin campo").
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

  const campaniasFetcher = async ([
    ,
    empresaIds,
    campanias,
    campos,
    lotes,
    cultivos,
    variedades,
  ]: [
      string,
      string,
      string,
      string,
      string,
      string,
      string
    ]) => {
    const params: Record<string, unknown> = {}
    if (empresaIds) params.empresaIds = empresaIds
    if (campanias) params.campanias = campanias
    if (campos) params.idCampo = campos
    if (lotes) params.idLote = lotes
    if (cultivos) params.idCultivo = cultivos
    if (variedades) params.idVariedad = variedades
    const res = await api.get('/campanias', { params })
    return res.data as CampaniaListItem[]
  }

  const { data: campanias = [], isLoading } = useSWR<CampaniaListItem[]>(
    canRead
      ? [
        'campanias',
        filterEmpresaIds.join(','),
        filterCampanias.join(','),
        filterCampoIds.join(','),
        lotesEfectivos.join(','),
        filterCultivoIds.join(','),
        variedadIdsEfectivos.join(','),
      ]
      : null,
    campaniasFetcher,
    { revalidateOnFocus: false, revalidateOnMount: true, dedupingInterval: 0 }
  )

  // Totales globales (para el header del dashboard)
  const totalesGlobales = useMemo(() => {
    const superficie = campanias.reduce((acc, c) => acc + (c.totales.supCosechada || 0), 0)
    const margen = campanias.reduce((acc, c) => acc + (c.totales.margenBrutoSAlquilerLote || 0), 0)
    return { superficie, margen, cantidad: campanias.length }
  }, [campanias])

  const clearFilters = () => {
    setFilterEmpresaIds([])
    setFilterCampanias([])
    setFilterCampoIds([])
    setFilterLoteIds([])
    setFilterCultivoIds([])
    setFilterVariedadIds([])
  }

  const hasActiveFilters =
    filterEmpresaIds.length > 0 ||
    filterCampanias.length > 0 ||
    filterCampoIds.length > 0 ||
    lotesEfectivos.length > 0 ||
    filterCultivoIds.length > 0 ||
    variedadIdsEfectivos.length > 0

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

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Producción</h1>
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nueva producción</span>
          </button>
        )}
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Producciones
          </p>
          <p className="text-2xl font-semibold text-foreground mt-1">{totalesGlobales.cantidad}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Superficie sembrada total
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

      {/* Búsqueda + filtros */}
      <div className="bg-card/60 border border-border rounded-lg p-3 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2.5">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Productor
            </label>
            <MultiselectFilter
              value={filterEmpresaIds.map(String)}
              opciones={filterEmpresasVisibles.map((e) => ({ value: String(e.id), label: e.nombre }))}
              onChange={(next) => setFilterEmpresaIds(next.map(Number))}
              placeholder="Todos"
              etiqueta="productore"
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
              Cultivo
            </label>
            <MultiselectFilter
              value={filterCultivoIds.map(String)}
              opciones={cultivos.map((c) => ({ value: String(c.id), label: c.nombre }))}
              onChange={(next) => setFilterCultivoIds(next.map(Number))}
              placeholder="Todos"
              etiqueta="cultivo"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Variedad
            </label>
            <MultiselectFilter
              value={variedadIdsEfectivos.map(String)}
              opciones={variedadesFiltradas.map((v) => ({ value: String(v.id), label: v.nombre }))}
              onChange={(next) => setFilterVariedadIds(next.map(Number))}
              placeholder={filterCultivoIds.length === 0 ? 'Elegí cultivo' : 'Todas'}
              etiqueta="variedad"
              vacio="Elegí un cultivo primero."
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <button
              onClick={clearFilters}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
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
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando producción...</p>
        </div>
      ) : campanias.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <FileSpreadsheet className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground mb-1">No hay producción cargada.</p>
          {canWrite && (
            <button
              onClick={goToCreate}
              className="text-sm font-medium text-primary hover:underline mt-1 cursor-pointer"
            >
              Crear la primera producción
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
                    Cultivo / Variedad
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Sup. Sem.
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
                        <span className="text-sm text-foreground">
                          {empresas.find((e) => e.id === c.lote?.idEmpresa)?.nombre
                            || `Productor #${c.lote?.idEmpresa ?? '—'}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {c.campania}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">{c.lote?.campo?.nombre || '—'}</span>
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
