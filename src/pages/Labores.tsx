import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  Plus, Search, Filter, Pencil, Activity,
  Lock, AlertCircle, Globe, ChevronDown, Check, X, Shield, ToggleLeft, ToggleRight, Loader2, Package
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

interface Labor {
  id: number
  nombre: string
  descripcion: string | null
  idEmpresa: number | null
  activo: boolean
  createdAt?: string
  updatedAt?: string
}

export default function Labores() {
  const [searchTerm, setSearchTerm] = useState('')

  // States for sys-admin
  const [showAll, setShowAll] = useState(false)
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingLabor, setEditingLabor] = useState<Labor | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    idEmpresa: null as number | null
  })

  // Per-item loading state
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set())

  const { user, permisos, isSysAdmin, isAsesor, empresas, currentEmpresaId } = useAuth()
  const canWrite = permisos.includes('escritura:labor')
  const canRead = permisos.includes('lectura:labor')

  // Fetcher que maneja parámetros de sys-admin
  const laboresFetcher = async ([url, currentEmpresaId, all, companyIds]: [string, number | null, boolean, string]) => {
    const params: any = {}
    if (isSysAdmin) {
      if (all) params.all = true
      if (companyIds) params.companyIds = companyIds
    }
    if (currentEmpresaId) params.currentEmpresaId = currentEmpresaId

    const res = await api.get(url, { params })
    return res.data
  }

  // SWR con Key compuesta para revalidar al cambiar empresa
  const { data: labores = [], isLoading, mutate } = useSWR<Labor[]>(
    canRead ? ['labores', currentEmpresaId, showAll, selectedCompanies.join(',')] : null,
    laboresFetcher,
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      dedupingInterval: 0,
    }
  )

  const filteredLabores = useMemo(() => {
    return labores
      ?.filter(l =>
        l.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.descripcion?.toLowerCase() || '').includes(searchTerm.toLowerCase())
      )
      ?.sort((a, b) => {
        // 1. Activo primero
        if (a.activo !== b.activo) return a.activo ? -1 : 1

        // 2. Globales primero (idEmpresa es null)
        if (a.idEmpresa !== b.idEmpresa) {
          if (a.idEmpresa === null) return -1;
          if (b.idEmpresa === null) return 1;
          // 3. Orden numérico por ID de empresa
          return a.idEmpresa - b.idEmpresa;
        }
        // 4. Orden alfabético por nombre
        return a.nombre.localeCompare(b.nombre);
      })
  }, [labores, searchTerm])

  const handleOpenModal = (labor: Labor | null = null) => {
    if (labor) {
      setEditingLabor(labor)
      setFormData({
        nombre: labor.nombre,
        descripcion: labor.descripcion || '',
        idEmpresa: labor.idEmpresa
      })
    } else {
      setEditingLabor(null)
      setFormData({
        nombre: '',
        descripcion: '',
        idEmpresa: isSysAdmin ? null : (currentEmpresaId || parseInt(user?.idEmpresa?.toString() || "") || null)
      })
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingLabor) {
        await api.patch(`/labores/${editingLabor.id}`, formData)
      } else {
        await api.post('/labores', formData)
      }
      setIsModalOpen(false)
      mutate() // Re-fetch data
    } catch (err) {
      console.error('Error al guardar labor', err)
    }
  }

  const handleToggleActivo = async (labor: Labor) => {
    setUpdatingIds(prev => new Set(prev).add(labor.id))
    try {
      await api.patch(`/labores/${labor.id}`, { activo: !labor.activo })
      await mutate() // Re-fetch data
    } catch (err) {
      console.error('Error al cambiar estado de la labor', err)
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev)
        next.delete(labor.id)
        return next
      })
    }
  }

  const toggleCompanySelection = (id: number) => {
    setSelectedCompanies(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  // Business Rule: Check if a labor is editable by the current user
  const isEditable = (labor: Labor) => {
    if (!canWrite) return false
    if (isSysAdmin) return true
    // Regular user cannot edit global ones (idEmpresa === null)
    return labor.idEmpresa !== null
  }

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle size={48} className="text-destructive mb-4" />
        <h2 className="text-2xl font-black">Acceso Denegado</h2>
        <p className="text-muted-foreground mt-2">No tienes permisos para ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-black text-foreground tracking-tight">Labores</h1>
            {isSysAdmin && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black uppercase rounded-lg flex items-center gap-1 border border-primary/20">
                <Shield size={10} />
                Global Admin
              </span>
            )}
          </div>
        </div>

        {canWrite && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-2xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 transition-all w-full sm:w-auto justify-center cursor-pointer"
          >
            <Plus size={20} />
            <span>Nueva Labor</span>
          </button>
        )}
      </div>

      {/* Admin Controls */}
      {isSysAdmin && (
        <div className="bg-card border border-primary/20 p-4 rounded-3xl shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                onClick={() => setShowAll(!showAll)}
                className={`relative w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${showAll ? 'bg-primary' : 'bg-muted'}`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${showAll ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm font-bold text-foreground">Ver todas las labores (incluyendo empresas)</span>
            </div>

            {showAll && (
              <div className="relative">
                <button
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="flex items-center gap-2 px-4 py-2 bg-accent/50 border border-border rounded-xl text-xs font-bold hover:bg-accent transition-all cursor-pointer"
                >
                  <Filter size={14} />
                  <span>Filtrar por Empresa ({selectedCompanies.length})</span>
                  <ChevronDown size={14} className={`transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                </button>

                {isFilterOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsFilterOpen(false)} />
                    <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-2xl shadow-xl z-40 overflow-hidden animate-in fade-in slide-in-from-top-2">
                      <div className="p-3 border-b border-border bg-accent/20 flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase text-muted-foreground">Empresas</span>
                        {selectedCompanies.length > 0 && (
                          <button onClick={() => setSelectedCompanies([])} className="text-[10px] font-bold text-primary cursor-pointer">Limpiar</button>
                        )}
                      </div>
                      <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                        {empresas?.map(e => (
                          <div
                            key={e.id}
                            onClick={() => toggleCompanySelection(e.id)}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${selectedCompanies.includes(e.id) ? 'bg-primary/10 text-primary' : 'hover:bg-accent'}`}
                          >
                            <span className="text-sm font-medium">{e.nombre}</span>
                            {selectedCompanies.includes(e.id) && <Check size={14} />}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {selectedCompanies?.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
              {selectedCompanies?.map(id => {
                const emp = empresas?.find(e => e.id === id)
                return (
                  <span key={id} className="flex items-center gap-1 px-2 py-1 bg-accent border border-border rounded-lg text-[10px] font-bold">
                    {emp?.nombre}
                    <X size={10} className="cursor-pointer" onClick={() => toggleCompanySelection(id)} />
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Actions & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-card/50 border border-border p-4 rounded-3xl backdrop-blur-sm">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Buscar labores por nombre o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-accent/30 dark:bg-accent/10 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium"
          />
        </div>
      </div>

      {/* Content Section */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-3xl border border-border border-dashed animate-pulse">
          <Activity className="size-10 text-primary mb-4 animate-bounce" />
          <p className="text-muted-foreground font-bold tracking-widest uppercase text-xs">Cargando labores...</p>
        </div>
      ) : (
        <>
          {/* Mobile View: Cards */}
          <div className="grid grid-cols-1 gap-4 sm:hidden">
            {filteredLabores?.map(labor => {
              const editable = isEditable(labor)
              return (
                <div key={labor.id} className={`bg-card border border-border p-5 rounded-3xl shadow-sm flex flex-col gap-4 transition-opacity ${!labor.activo ? 'opacity-70' : ''}`}>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-foreground text-lg leading-tight">{labor.nombre}</h3>
                        {labor.idEmpresa === null && <span title="Labor Global"><Globe size={14} className="text-blue-500" /></span>}
                        {!labor.activo && <span className="text-[10px] font-black uppercase text-destructive dark:text-destructive-foreground bg-destructive/30 px-1.5 py-0.5 rounded-md">Inactivo</span>}
                      </div>
                      {labor.descripcion && <p className="text-xs text-muted-foreground line-clamp-2">{labor.descripcion}</p>}
                    </div>
                    <div className="flex gap-2">
                      {editable ? (
                        <>
                          <button onClick={() => handleOpenModal(labor)} className="p-2 rounded-xl bg-accent text-primary hover:bg-primary/10 transition-colors cursor-pointer" disabled={updatingIds.has(labor.id)}>
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleToggleActivo(labor)}
                            className={`p-2 rounded-xl bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${labor.activo ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-muted-foreground hover:bg-muted'}`}
                            title={labor.activo ? 'Desactivar' : 'Activar'}
                            disabled={updatingIds.has(labor.id)}
                          >
                            {updatingIds.has(labor.id) ? (
                              <Loader2 size={20} className="animate-spin" />
                            ) : labor.activo ? (
                              <ToggleRight size={20} />
                            ) : (
                              <ToggleLeft size={20} />
                            )}
                          </button>
                        </>
                      ) : (
                        <div className="p-2 rounded-xl bg-muted text-muted-foreground" title="Esta labor es global y no puede ser editada">
                          <Lock size={16} />
                        </div>
                      )}
                    </div>
                  </div>

                  {(isSysAdmin || isAsesor) && labor.idEmpresa !== null && (
                    <div className="pt-2 border-t border-border/50 text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                      <Package size={10} />
                      Empresa: {empresas.find(e => e.id === labor.idEmpresa)?.nombre || `ID: ${labor.idEmpresa}`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Desktop/Tablet View: Table */}
          <div className="hidden sm:block overflow-hidden bg-card border border-border rounded-3xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-accent/30">
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60 w-1/4">Nombre</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60">Descripción</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60 w-1/6">Alcance</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60 w-1/6">Estado</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredLabores?.map(labor => {
                    const editable = isEditable(labor)
                    return (
                      <tr key={labor.id} className={`group transition-colors ${labor.activo ? 'hover:bg-accent/20' : 'bg-destructive/5 opacity-70'}`}>
                        <td className="px-6 py-4">
                          <span className={`font-bold ${labor.activo ? 'text-foreground' : 'text-muted-foreground'}`}>{labor.nombre}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-muted-foreground line-clamp-1">{labor.descripcion || '-'}</span>
                        </td>
                        <td className="px-6 py-4">
                          {labor.idEmpresa === null ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-[10px] font-black uppercase tracking-wider">
                              <Globe size={12} />
                              Global
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 text-[10px] font-black uppercase tracking-wider">
                              <Package size={12} />
                              {(isSysAdmin || isAsesor) ? (
                                `${empresas.find(e => e.id === labor.idEmpresa)?.nombre || 'Empresa'} (ID: ${labor.idEmpresa})`
                              ) : 'Mi Empresa'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${labor.activo ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400' : 'bg-destructive/30 text-destructive dark:text-destructive-foreground'}`}>
                            {labor.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {editable ? (
                              <>
                                <button
                                  onClick={() => handleOpenModal(labor)}
                                  className="p-2 rounded-xl bg-accent text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-xs group-hover:scale-110 cursor-pointer"
                                  title="Editar"
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  onClick={() => handleToggleActivo(labor)}
                                  className={`p-2 rounded-xl bg-accent transition-all shadow-xs group-hover:scale-110 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${labor.activo ? 'text-emerald-500 hover:bg-emerald-500 hover:text-white' : 'text-muted-foreground hover:bg-destructive hover:text-white'}`}
                                  title={labor.activo ? 'Desactivar' : 'Activar'}
                                  disabled={updatingIds.has(labor.id)}
                                >
                                  {updatingIds.has(labor.id) ? (
                                    <Loader2 size={20} className="animate-spin" />
                                  ) : labor.activo ? (
                                    <ToggleRight size={20} />
                                  ) : (
                                    <ToggleLeft size={20} />
                                  )}
                                </button>
                              </>
                            ) : (
                              <div
                                className="p-2 rounded-xl bg-muted text-muted-foreground cursor-help"
                                title="Esta labor es global y no puede ser editada"
                              >
                                <Lock size={16} />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredLabores?.length === 0 && (
              <div className="p-12 text-center">
                <Activity className="size-12 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">No se encontraron labores.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal for Create/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md transition-opacity" onClick={() => setIsModalOpen(false)} />

          <div className="relative w-full max-w-lg bg-card border border-border shadow-2xl rounded-3xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h2 className="text-xl font-black text-foreground uppercase tracking-tight">
                {editingLabor ? 'Editar Labor' : 'Nueva Labor'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-accent rounded-full text-muted-foreground transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form className="p-6 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">Nombre</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Siembra Directa"
                  required
                  className="w-full px-4 py-3 bg-accent/30 dark:bg-accent/10 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">Descripción</label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  placeholder="Detalles adicionales de la labor..."
                  rows={3}
                  className="w-full px-4 py-3 bg-accent/30 dark:bg-accent/10 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground font-medium resize-none"
                />
              </div>

              {isSysAdmin && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">Empresa Destino</label>
                  <select
                    value={formData.idEmpresa === null ? "" : formData.idEmpresa}
                    onChange={(e) => setFormData({ ...formData, idEmpresa: e.target.value === "" ? null : parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-accent/30 dark:bg-accent/10 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground font-bold"
                  >
                    <option value="">Global (Todas las empresas)</option>
                    {empresas?.map(e => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground px-1">
                    Solo como sys-admin puedes crear labores globales o asignarlas a otras empresas.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-5 py-3 border border-border rounded-xl font-bold text-foreground hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-5 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                  {editingLabor ? 'Guardar Cambios' : 'Crear Labor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
