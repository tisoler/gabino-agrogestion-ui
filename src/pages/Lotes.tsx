import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Pencil, MapPin, Activity,
  Lock, AlertCircle, Shield, ToggleLeft, ToggleRight, Loader2, User
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import MultiselectFilter from '../components/MultiselectFilter'
import MapaLote from '../components/MapaLote'
import SelectAutocomplete from '../components/SelectAutocomplete'

interface Campo {
  id: number
  nombre: string
  idEmpresa: number | null
  activo: boolean
}

interface Lote {
  id: number
  descripcion: string | null
  idCampo: number | null
  campo?: Campo | null
  idUsuario: string
  nombreUsuario: string | null
  emailUsuario: string | null
  idEmpresa: number
  geometria?: GeoJSON.GeoJsonObject | null
  centroide?: { lat: number; lng: number } | null
  area?: number | null
  activo: boolean
  createdAt?: string
  updatedAt?: string
}

export default function Lotes() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterEmpresaId, setFilterEmpresaId] = useState<number | null>(null)
  const [filterCampos, setFilterCampos] = useState<string[]>([])

  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set())
  const [selectedLoteId, setSelectedLoteId] = useState<number | null>(null)

  const { user, permisos, isSysAdmin, empresas } = useAuth()
  const isAdmin = isSysAdmin
  const canWrite = permisos.includes('escritura:lote')
  const canRead = permisos.includes('lectura:lote')
  const userEmpresas = (user?.idEmpresas || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
  const listEmpresas = isAdmin ? empresas : empresas.filter((e) => userEmpresas.includes(e.id))

  // Catálogo de campos (nombres para el filtro)

  // Fetcher: sólo el parámetro currentEmpresaId (no hay flag "all" ni "companyIds",
  // ya no hay lotes globales y la API filtra por scope del usuario cuando no
  // se manda empresa).
  const lotesFetcher = async ([url, empresaId]: [string, number | null]) => {
    const params: Record<string, unknown> = {}
    if (empresaId) params.currentEmpresaId = empresaId
    const res = await api.get(url, { params })
    return res.data
  }

  // Para cualquier usuario, la empresa filtrada es la del selector de la tabla
  // (null = todas / todas sus empresas).
  const effectiveEmpresaId = filterEmpresaId

  const { data: lotes = [], isLoading, mutate } = useSWR<Lote[]>(
    canRead ? ['lotes', effectiveEmpresaId] : null,
    lotesFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 0,
    }
  )

  const campoNombres = useMemo(
    () =>
      Array.from(new Set(lotes.map((l) => l.campo?.nombre).filter((c): c is string => !!c && c.trim() !== '')))
        .sort((a, b) => a.localeCompare(b, 'es')),
    [lotes]
  )

  // Conserva solo los campos que sigan existiendo entre las opciones (el
  // productor filtrado puede cambiar los campos disponibles).
  const camposEfectivos = useMemo(
    () => filterCampos.filter((c) => campoNombres.includes(c)),
    [filterCampos, campoNombres]
  )

  const filteredLotes = useMemo(() => {
    return lotes
      ?.filter((l) => {
        if (camposEfectivos.length > 0 && !camposEfectivos.includes(l.campo?.nombre ?? '')) return false
        const term = searchTerm.toLowerCase()
        if (!term) return true
        return (
          (l.descripcion?.toLowerCase() || '').includes(term) ||
          (l.campo?.nombre || '').toLowerCase().includes(term) ||
          (l.nombreUsuario || '').toLowerCase().includes(term) ||
          (l.emailUsuario || '').toLowerCase().includes(term) ||
          l.idUsuario.toLowerCase().includes(term)
        )
      })
      ?.toSorted((a, b) => {
        if (a.activo !== b.activo) return a.activo ? -1 : 1
        if (a.idEmpresa !== b.idEmpresa) return a.idEmpresa - b.idEmpresa
        return (a.descripcion || '').localeCompare(b.descripcion || '')
      })
  }, [lotes, searchTerm, camposEfectivos])

  const loteSeleccionado = useMemo(() => {
    if (filteredLotes.length === 0) return undefined
    return filteredLotes.find((l) => l.id === selectedLoteId) ?? filteredLotes[0]
  }, [filteredLotes, selectedLoteId])

  const goToDetail = (id: number) => navigate(`/lotes/${id}`)

  const handleToggleActivo = async (lote: Lote) => {
    setUpdatingIds((prev) => new Set(prev).add(lote.id))
    try {
      await api.patch(`/lotes/${lote.id}`, { activo: !lote.activo })
      await mutate()
    } catch (err) {
      console.error('Error al cambiar estado del lote', err)
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev)
        next.delete(lote.id)
        return next
      })
    }
  }

  const isEditable = (lote: Lote) => {
    if (!canWrite) return false
    if (isAdmin) return true
    const authorizedEmpresas = (user?.idEmpresas || []).map((e) => Number(e))
    return authorizedEmpresas.includes(lote.idEmpresa)
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

  const filterEmpresaLabel = empresas.find((e) => e.id === filterEmpresaId)?.nombre

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Lotes</h1>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                <Shield className="size-3" strokeWidth={2} />
                Admin
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo de lotes y parcelas por usuario</p>
        </div>

        {canWrite && (
          <button
            onClick={() => navigate('/lotes/nuevo')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nuevo Lote</span>
          </button>
        )}
      </div>

      {/* Filtros: búsqueda + empresa */}
      <div className="bg-card/60 border border-border rounded-lg p-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative group flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Buscar por descripción, dueño o UID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
            />
          </div>
          {(listEmpresas.length > 0 && (isAdmin || userEmpresas.length > 1)) && (
            <SelectAutocomplete
              value={filterEmpresaId ?? ''}
              onChange={(v) => setFilterEmpresaId(v === '' ? null : Number(v))}
              options={listEmpresas.map((e) => ({ value: e.id, label: e.nombre }))}
              clearable
              placeholder={
                isAdmin
                  ? 'Todos los productores'
                  : userEmpresas.length > 1
                    ? 'Todos mis productores'
                    : 'Mi productor'
              }
              className="sm:w-64"
            />
          )}
          <MultiselectFilter
            value={camposEfectivos}
            opciones={campoNombres.map((n) => ({ value: n, label: n }))}
            onChange={setFilterCampos}
            placeholder="Todos los campos"
            etiqueta="campo"
            vacio="Sin campos cargados."
            widthCls="w-full sm:w-64"
          />
        </div>
        {filterEmpresaLabel && (
          <p className="text-[11px] text-muted-foreground mt-2 px-1">
            Filtrando por <span className="font-medium text-foreground">{filterEmpresaLabel}</span>
          </p>
        )}
        {camposEfectivos.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1 px-1">
            Campos: <span className="font-medium text-foreground">{camposEfectivos.join(', ')}</span>
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando lotes...</p>
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 space-y-4 w-full">
            <div className="grid grid-cols-1 gap-3 sm:hidden">
              {filteredLotes?.map((lote) => {
                const editable = isEditable(lote)
                return (
                  <div
                    key={lote.id}
                    onClick={() => setSelectedLoteId(lote.id)}
                    className={`cursor-pointer bg-card border rounded-lg p-4 space-y-3 transition-colors ${!lote.activo ? 'opacity-60 border-border' : 'border-border'
                      } ${selectedLoteId === lote.id
                        ? 'border-primary bg-primary-soft/30'
                        : ''
                      }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold text-foreground leading-tight">
                            {lote.descripcion || 'Lote sin descripción'}
                          </h3>
                          {!lote.activo && (
                            <span className="px-1.5 py-0.5 bg-destructive-soft text-destructive text-[10px] font-semibold uppercase tracking-wider rounded">
                              Inactivo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <User className="size-3" strokeWidth={1.75} />
                          <span className="truncate">
                            {lote.nombreUsuario || lote.emailUsuario || `UID: ${lote.idUsuario}`}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Campo: <span className="text-foreground font-medium">{lote.campo?.nombre || '—'}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Área: <span className="text-foreground font-medium">{lote.area != null ? `${Number(lote.area).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha` : '—'}</span>
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {editable ? (
                          <>
                            <button
                              onClick={() => goToDetail(lote.id)}
                              className="cursor-pointer p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors"
                              disabled={updatingIds.has(lote.id)}
                              aria-label="Editar"
                            >
                              <Pencil className="size-3.5" strokeWidth={1.75} />
                            </button>
                            <button
                              onClick={() => handleToggleActivo(lote)}
                              className={`cursor-pointer p-1.5 rounded-md transition-colors disabled:opacity-50 ${lote.activo
                                ? 'text-success hover:bg-success-soft'
                                : 'text-muted-foreground hover:bg-muted'
                                }`}
                              title={lote.activo ? 'Desactivar' : 'Activar'}
                              disabled={updatingIds.has(lote.id)}
                              aria-label={lote.activo ? 'Desactivar' : 'Activar'}
                            >
                              {updatingIds.has(lote.id) ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : lote.activo ? (
                                <ToggleRight className="size-4" strokeWidth={1.75} />
                              ) : (
                                <ToggleLeft className="size-4" strokeWidth={1.75} />
                              )}
                            </button>
                          </>
                        ) : (
                          <span
                            className="p-1.5 rounded-md bg-muted text-muted-foreground"
                            title="No tiene permisos para editar este lote"
                          >
                            <Lock className="size-3.5" strokeWidth={1.75} />
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="size-3" strokeWidth={1.75} />
                      <span>Productor: {empresas.find((e) => e.id === lote.idEmpresa)?.nombre || `ID: ${lote.idEmpresa}`}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="hidden sm:block bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Campo
                      </th>
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Nombre del lote
                      </th>
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                        Área (ha)
                      </th>
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Dueño
                      </th>
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Productor
                      </th>
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredLotes?.map((lote) => {
                      const editable = isEditable(lote)
                      return (
                        <tr
                          key={lote.id}
                          onClick={() => setSelectedLoteId(lote.id)}
                          className={`cursor-pointer transition-colors ${selectedLoteId === lote.id
                            ? 'bg-primary-soft/80'
                            : lote.activo
                              ? 'hover:bg-muted/40'
                              : 'bg-muted/20 opacity-60'
                            }`}
                        >
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                              {lote.campo?.nombre || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-medium ${lote.activo ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {lote.descripcion || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {lote.area != null
                              ? `${Number(lote.area).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : '—'}
                            {lote.area != null && <span className="text-[10px] text-muted-foreground ml-0.5">ha</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm text-foreground truncate">
                                {lote.nombreUsuario || lote.emailUsuario || lote.idUsuario}
                              </span>
                              {lote.emailUsuario && (
                                <span className="text-xs text-muted-foreground truncate">{lote.emailUsuario}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-soft text-warning-foreground text-[10px] font-semibold uppercase tracking-wider rounded">
                              <MapPin className="size-3" strokeWidth={2} />
                              {empresas.find((e) => e.id === lote.idEmpresa)?.nombre || `ID: ${lote.idEmpresa}`}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${lote.activo
                                ? 'bg-success-soft text-success'
                                : 'bg-destructive-soft text-destructive'
                                }`}
                            >
                              {lote.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex justify-end gap-1">
                              {editable ? (
                                <>
                                  <button
                                    onClick={() => goToDetail(lote.id)}
                                    className="cursor-pointer p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors"
                                    title="Editar"
                                    aria-label="Editar"
                                  >
                                    <Pencil className="size-3.5" strokeWidth={1.75} />
                                  </button>
                                  <button
                                    onClick={() => handleToggleActivo(lote)}
                                    className={`cursor-pointer p-1.5 rounded-md transition-colors disabled:opacity-50 ${lote.activo
                                      ? 'text-success hover:bg-success-soft'
                                      : 'text-muted-foreground hover:bg-muted'
                                      }`}
                                    title={lote.activo ? 'Desactivar' : 'Activar'}
                                    disabled={updatingIds.has(lote.id)}
                                    aria-label={lote.activo ? 'Desactivar' : 'Activar'}
                                  >
                                    {updatingIds.has(lote.id) ? (
                                      <Loader2 className="size-4 animate-spin" />
                                    ) : lote.activo ? (
                                      <ToggleRight className="size-4" strokeWidth={1.75} />
                                    ) : (
                                      <ToggleLeft className="size-4" strokeWidth={1.75} />
                                    )}
                                  </button>
                                </>
                              ) : (
                                <span
                                  className="p-1.5 rounded-md bg-muted text-muted-foreground inline-flex"
                                  title="No tiene permisos para editar este lote"
                                >
                                  <Lock className="size-3.5" strokeWidth={1.75} />
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {filteredLotes?.length === 0 && (
                <div className="p-12 text-center">
                  <MapPin className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                  <p className="text-sm text-muted-foreground">
                    {searchTerm || filterEmpresaId || camposEfectivos.length > 0
                      ? 'No se encontraron lotes con esos criterios.'
                      : 'Aún no hay lotes cargados.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Mapa del lote seleccionado */}
          <div className="w-full xl:w-[320px] xl:sticky xl:top-4">
            <div className="bg-card border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Mapa del lote</h3>
                {loteSeleccionado && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {loteSeleccionado.descripcion || `Lote #${loteSeleccionado.id}`}
                  </span>
                )}
              </div>
              {loteSeleccionado ? (
                <MapaLote
                  altura="h-108"
                  geometria={loteSeleccionado.geometria}
                  centroide={loteSeleccionado.centroide}
                />
              ) : (
                <p className="text-sm text-muted-foreground py-10 text-center">
                  Seleccioná un lote para verlo en el mapa.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
