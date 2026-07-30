import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  Plus, Search, Filter, Pencil, DollarSign, Activity,
  Lock, AlertCircle, Globe, ChevronDown, Check, X, Shield, ToggleLeft, ToggleRight, Loader2, Package
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

interface Costo {
  id: number
  nombre: string
  descripcion: string | null
  idEmpresa: number | null
  activo: boolean
  createdAt?: string
  updatedAt?: string
}

export default function Costos() {
  const [searchTerm, setSearchTerm] = useState('')

  const [showAll, setShowAll] = useState(false)
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCosto, setEditingCosto] = useState<Costo | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    idEmpresa: null as number | null
  })

  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set())

  const { permisos, isSysAdmin, isAsesor, empresas, currentEmpresaId } = useAuth()
  const canWrite = permisos.includes('escritura:costo')
  const canRead = permisos.includes('lectura:costo')

  const costosFetcher = async ([url, currentEmpresaId, all, companyIds]: [string, number | null, boolean, string]) => {
    const params: any = {}
    if (isSysAdmin) {
      if (all) params.all = true
      if (companyIds) params.companyIds = companyIds
    }
    if (currentEmpresaId) params.currentEmpresaId = currentEmpresaId

    const res = await api.get(url, { params })
    return res.data
  }

  const { data: costos = [], isLoading, mutate } = useSWR<Costo[]>(
    canRead ? ['costos', currentEmpresaId, showAll, selectedCompanies.join(',')] : null,
    costosFetcher,
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      dedupingInterval: 0,
    }
  )

  const filteredCostos = useMemo(() => {
    return costos
      ?.filter(c =>
        c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.descripcion?.toLowerCase() || '').includes(searchTerm.toLowerCase())
      )
      ?.toSorted((a, b) => {
        if (a.activo !== b.activo) return a.activo ? -1 : 1
        if (a.idEmpresa !== b.idEmpresa) {
          if (a.idEmpresa === null) return -1
          if (b.idEmpresa === null) return 1
          return a.idEmpresa - b.idEmpresa
        }
        return a.nombre.localeCompare(b.nombre)
      })
  }, [costos, searchTerm])

  const handleOpenModal = (costo: Costo | null = null) => {
    if (costo) {
      setEditingCosto(costo)
      setFormData({
        nombre: costo.nombre,
        descripcion: costo.descripcion || '',
        idEmpresa: costo.idEmpresa
      })
    } else {
      setEditingCosto(null)
      setFormData({
        nombre: '',
        descripcion: '',
        idEmpresa: isSysAdmin ? null : (currentEmpresaId || null)
      })
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingCosto) {
        await api.patch(`/costos/${editingCosto.id}`, formData)
      } else {
        await api.post('/costos', formData)
      }
      setIsModalOpen(false)
      mutate()
    } catch (err) {
      console.error('Error al guardar costo', err)
    }
  }

  const handleToggleActivo = async (costo: Costo) => {
    setUpdatingIds(prev => new Set(prev).add(costo.id))
    try {
      await api.patch(`/costos/${costo.id}`, { activo: !costo.activo })
      await mutate()
    } catch (err) {
      console.error('Error al cambiar estado del costo', err)
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev)
        next.delete(costo.id)
        return next
      })
    }
  }

  const toggleCompanySelection = (id: number) => {
    setSelectedCompanies(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const isEditable = (costo: Costo) => {
    if (!canWrite) return false
    if (isSysAdmin) return true
    return costo.idEmpresa !== null
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Costos</h1>
            {isSysAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                <Shield className="size-3" strokeWidth={2} />
                Global Admin
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo maestro de costos directos e indirectos</p>
        </div>

        {canWrite && (
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nuevo Costo</span>
          </button>
        )}
      </div>

      {isSysAdmin && (
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
                className={`relative inline-flex w-9 h-5 items-center rounded-full transition-colors ${
                  showAll ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`inline-block size-4 rounded-full bg-white shadow transform transition-transform ${
                    showAll ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
              <span className="text-sm text-foreground">Ver todos los costos (incluyendo empresas)</span>
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
                  <span>Filtrar por empresa ({selectedCompanies.length})</span>
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
                      <div className="px-3 py-2 border-b border-border bg-accent/40 flex justify-between items-center">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Empresas
                        </span>
                        {selectedCompanies.length > 0 && (
                          <button
                            onClick={() => setSelectedCompanies([])}
                            className="text-[10px] font-medium text-primary hover:underline"
                          >
                            Limpiar
                          </button>
                        )}
                      </div>
                      <div className="max-h-60 overflow-y-auto p-1">
                        {empresas?.map((e) => (
                          <button
                            type="button"
                            key={e.id}
                            onClick={() => toggleCompanySelection(e.id)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-sm transition-colors ${
                              selectedCompanies.includes(e.id)
                                ? 'bg-primary-soft text-primary font-medium'
                                : 'text-foreground hover:bg-accent'
                            }`}
                          >
                            <span className="truncate">{e.nombre}</span>
                            {selectedCompanies.includes(e.id) && <Check className="size-3.5 shrink-0" strokeWidth={2} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {selectedCompanies?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border">
              {selectedCompanies?.map((id) => {
                const emp = empresas?.find((e) => e.id === id)
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent border border-border rounded text-[11px] font-medium text-foreground"
                  >
                    {emp?.nombre}
                    <button
                      type="button"
                      onClick={() => toggleCompanySelection(id)}
                      className="ml-0.5 hover:text-destructive"
                      aria-label={`Quitar ${emp?.nombre}`}
                    >
                      <X className="size-3" strokeWidth={2} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-card/60 border border-border rounded-lg p-3">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Buscar costos por nombre o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando costos...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {filteredCostos?.map((costo) => {
              const editable = isEditable(costo)
              return (
                <div
                  key={costo.id}
                  className={`bg-card border border-border rounded-lg p-4 space-y-3 transition-opacity ${
                    !costo.activo ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-foreground leading-tight">{costo.nombre}</h3>
                        {costo.idEmpresa === null && (
                          <span title="Costo global">
                            <Globe className="size-3.5 text-info" strokeWidth={2} />
                          </span>
                        )}
                        {!costo.activo && (
                          <span className="px-1.5 py-0.5 bg-destructive-soft text-destructive text-[10px] font-semibold uppercase tracking-wider rounded">
                            Inactivo
                          </span>
                        )}
                      </div>
                      {costo.descripcion && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{costo.descripcion}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {editable ? (
                        <>
                          <button
                            onClick={() => handleOpenModal(costo)}
                            className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors"
                            disabled={updatingIds.has(costo.id)}
                            aria-label="Editar"
                          >
                            <Pencil className="size-3.5" strokeWidth={1.75} />
                          </button>
                          <button
                            onClick={() => handleToggleActivo(costo)}
                            className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                              costo.activo
                                ? 'text-success hover:bg-success-soft'
                                : 'text-muted-foreground hover:bg-muted'
                            }`}
                            title={costo.activo ? 'Desactivar' : 'Activar'}
                            disabled={updatingIds.has(costo.id)}
                            aria-label={costo.activo ? 'Desactivar' : 'Activar'}
                          >
                            {updatingIds.has(costo.id) ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : costo.activo ? (
                              <ToggleRight className="size-4" strokeWidth={1.75} />
                            ) : (
                              <ToggleLeft className="size-4" strokeWidth={1.75} />
                            )}
                          </button>
                        </>
                      ) : (
                        <span
                          className="p-1.5 rounded-md bg-muted text-muted-foreground"
                          title="Este costo es global y no puede ser editado"
                        >
                          <Lock className="size-3.5" strokeWidth={1.75} />
                        </span>
                      )}
                    </div>
                  </div>

                  {(isSysAdmin || isAsesor) && costo.idEmpresa !== null && (
                    <div className="pt-2 border-t border-border text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Package className="size-3" strokeWidth={1.75} />
                      <span>Empresa: {empresas.find((e) => e.id === costo.idEmpresa)?.nombre || `ID: ${costo.idEmpresa}`}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="hidden sm:block bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-1/4">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Descripción
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-1/6">
                      Alcance
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-1/6">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredCostos?.map((costo) => {
                    const editable = isEditable(costo)
                    return (
                      <tr
                        key={costo.id}
                        className={`transition-colors ${costo.activo ? 'hover:bg-muted/40' : 'bg-muted/20 opacity-60'}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`font-medium ${costo.activo ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {costo.nombre}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground line-clamp-1">{costo.descripcion || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {costo.idEmpresa === null ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-info-soft text-info text-[10px] font-semibold uppercase tracking-wider rounded">
                              <Globe className="size-3" strokeWidth={2} />
                              Global
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-soft text-warning-foreground text-[10px] font-semibold uppercase tracking-wider rounded">
                              <Package className="size-3" strokeWidth={2} />
                              {isSysAdmin || isAsesor
                                ? `${empresas.find((e) => e.id === costo.idEmpresa)?.nombre || 'Empresa'} · ${costo.idEmpresa}`
                                : 'Mi Empresa'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
                              costo.activo
                                ? 'bg-success-soft text-success'
                                : 'bg-destructive-soft text-destructive'
                            }`}
                          >
                            {costo.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex justify-end gap-1">
                            {editable ? (
                              <>
                                <button
                                  onClick={() => handleOpenModal(costo)}
                                  className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors"
                                  title="Editar"
                                  aria-label="Editar"
                                >
                                  <Pencil className="size-3.5" strokeWidth={1.75} />
                                </button>
                                <button
                                  onClick={() => handleToggleActivo(costo)}
                                  className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                                    costo.activo
                                      ? 'text-success hover:bg-success-soft'
                                      : 'text-muted-foreground hover:bg-muted'
                                  }`}
                                  title={costo.activo ? 'Desactivar' : 'Activar'}
                                  disabled={updatingIds.has(costo.id)}
                                  aria-label={costo.activo ? 'Desactivar' : 'Activar'}
                                >
                                  {updatingIds.has(costo.id) ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : costo.activo ? (
                                    <ToggleRight className="size-4" strokeWidth={1.75} />
                                  ) : (
                                    <ToggleLeft className="size-4" strokeWidth={1.75} />
                                  )}
                                </button>
                              </>
                            ) : (
                              <span
                                className="p-1.5 rounded-md bg-muted text-muted-foreground inline-flex"
                                title="Este costo es global y no puede ser editado"
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
            {filteredCostos?.length === 0 && (
              <div className="p-12 text-center">
                <DollarSign className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">No se encontraron costos.</p>
              </div>
            )}
          </div>
        </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
            aria-hidden
          />

          <div className="relative w-full max-w-lg bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">
                {editingCosto ? 'Editar Costo' : 'Nuevo Costo'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <form className="p-5 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label htmlFor="costo-nombre" className="text-xs font-medium text-foreground">
                  Nombre
                </label>
                <input
                  id="costo-nombre"
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Gasoil"
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="costo-descripcion" className="text-xs font-medium text-foreground">
                  Descripción
                </label>
                <textarea
                  id="costo-descripcion"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  placeholder="Detalles adicionales del costo..."
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors resize-none"
                />
              </div>

              {isSysAdmin && (
                <div className="space-y-1.5">
                  <label htmlFor="costo-empresa" className="text-xs font-medium text-foreground">
                    Empresa destino
                  </label>
                  <select
                    id="costo-empresa"
                    value={formData.idEmpresa === null ? '' : formData.idEmpresa}
                    onChange={(e) =>
                      setFormData({ ...formData, idEmpresa: e.target.value === '' ? null : parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                  >
                    <option value="">Global (todas las empresas)</option>
                    {empresas?.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Solo como sys-admin puedes crear costos globales o asignarlos a otras empresas.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
                >
                  {editingCosto ? 'Guardar cambios' : 'Crear Costo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
