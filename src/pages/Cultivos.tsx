import { useState, useMemo, Fragment } from 'react'
import useSWR from 'swr'
import {
  Plus, Search, Filter, Pencil, Sprout, Activity,
  Lock, AlertCircle, Globe, ChevronDown, Check, X, Shield, ToggleLeft, ToggleRight, Loader2,
  Layers, ChevronUp
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

interface Variedad {
  id: number
  idCultivo: number
  nombre: string
  idEmpresa: number | null
  activo: boolean
}

interface Cultivo {
  id: number
  nombre: string
  descripcion: string | null
  idEmpresa: number | null
  activo: boolean
  variedades: Variedad[]
}

export default function Cultivos() {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCrops, setExpandedCrops] = useState<Set<number>>(new Set())

  // States for sys-admin
  const [showAll, setShowAll] = useState(false)
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCultivo, setEditingCultivo] = useState<Cultivo | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    idEmpresa: null as number | null
  })

  // Variety Modal/Management State
  const [isVarietyModalOpen, setIsVarietyModalOpen] = useState(false)
  const [editingVariedad, setEditingVariedad] = useState<Variedad | null>(null)
  const [variedadFormData, setVariedadFormData] = useState({
    nombre: '',
    idCultivo: 0
  })

  // Per-item loading state
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set())

  const { user, permisos, isSysAdmin, isAsesor, empresas, currentEmpresaId } = useAuth()
  const canWrite = permisos.includes('escritura:cultivo')
  const canRead = permisos.includes('lectura:cultivo')

  const cultivosFetcher = async ([url, currentEmpresaId, all, companyIds]: [string, number | null, boolean, string]) => {
    const params: any = {}
    if (isSysAdmin) {
      if (all) params.all = true
      if (companyIds) params.companyIds = companyIds
    }
    if (currentEmpresaId) params.currentEmpresaId = currentEmpresaId

    const res = await api.get(url, { params })
    return res.data
  }

  const { data: cultivos = [], isLoading, mutate } = useSWR<Cultivo[]>(
    canRead ? ['cultivos', currentEmpresaId, showAll, selectedCompanies.join(',')] : null,
    cultivosFetcher,
    { revalidateOnFocus: true }
  )

  const filteredCultivos = useMemo(() => {
    return cultivos
      ?.filter(c =>
        c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.descripcion?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        c.variedades.some(v => v.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
      )
      ?.sort((a, b) => {
        if (a.idEmpresa !== b.idEmpresa) {
          if (a.idEmpresa === null) return -1;
          if (b.idEmpresa === null) return 1;
          return a.idEmpresa - b.idEmpresa;
        }
        return a.nombre.localeCompare(b.nombre);
      })
  }, [cultivos, searchTerm])

  const handleOpenModal = (cultivo: Cultivo | null = null) => {
    if (cultivo) {
      setEditingCultivo(cultivo)
      setFormData({
        nombre: cultivo.nombre,
        descripcion: cultivo.descripcion || '',
        idEmpresa: cultivo.idEmpresa
      })
    } else {
      setEditingCultivo(null)
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
      if (editingCultivo) {
        await api.patch(`/cultivos/${editingCultivo.id}`, formData)
      } else {
        await api.post('/cultivos', formData)
      }
      setIsModalOpen(false)
      mutate()
    } catch (err) {
      console.error('Error al guardar cultivo', err)
    }
  }

  const handleToggleActivo = async (item: Cultivo | Variedad, type: 'cultivo' | 'variedad') => {
    setUpdatingIds(prev => new Set(prev).add(item.id))
    try {
      const endpoint = type === 'cultivo' ? `/cultivos/${item.id}` : `/cultivos/variedades/${item.id}`
      await api.patch(endpoint, { activo: !item.activo })
      mutate()
    } catch (err) {
      console.error(`Error al cambiar estado del ${type}`, err)
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  const handleOpenVarietyModal = (cultivo: Cultivo, variedad: Variedad | null = null) => {
    if (variedad) {
      setEditingVariedad(variedad)
      setVariedadFormData({ nombre: variedad.nombre, idCultivo: cultivo.id })
    } else {
      setEditingVariedad(null)
      setVariedadFormData({ nombre: '', idCultivo: cultivo.id })
    }
    setIsVarietyModalOpen(true)
  }

  const handleVarietySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingVariedad) {
        await api.patch(`/cultivos/variedades/${editingVariedad.id}`, { nombre: variedadFormData.nombre })
      } else {
        await api.post('/cultivos/variedades', variedadFormData)
      }
      setIsVarietyModalOpen(false)
      mutate()
    } catch (err) {
      console.error('Error al guardar variedad', err)
    }
  }

  const toggleExpand = (id: number) => {
    setExpandedCrops(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isEditable = (item: { idEmpresa: number | null }) => {
    if (!canWrite) return false
    if (isSysAdmin) return true
    return item.idEmpresa !== null
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-black text-foreground tracking-tight">Cultivos</h1>
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
            className="flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-2xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all w-full sm:w-auto justify-center"
          >
            <Plus size={20} />
            <span>Nuevo Cultivo</span>
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
              <span className="text-sm font-bold text-foreground">Ver todos los cultivos (incluyendo empresas)</span>
            </div>

            {showAll && (
              <div className="relative">
                <button
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="flex items-center gap-2 px-4 py-2 bg-accent/50 border border-border rounded-xl text-xs font-bold hover:bg-accent transition-all"
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
                          <button onClick={() => setSelectedCompanies([])} className="text-[10px] font-bold text-primary">Limpiar</button>
                        )}
                      </div>
                      <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                        {empresas?.map(e => (
                          <div
                            key={e.id}
                            onClick={() => setSelectedCompanies(prev => prev.includes(e.id) ? prev.filter(x => x !== e.id) : [...prev, e.id])}
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
        </div>
      )}

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4 bg-card/50 border border-border p-4 rounded-3xl backdrop-blur-sm">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Buscar por cultivo o variedad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-accent/30 dark:bg-accent/10 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-3xl border border-border border-dashed animate-pulse">
          <Activity className="size-10 text-primary mb-4 animate-bounce" />
          <p className="text-muted-foreground font-bold tracking-widest uppercase text-xs">Cargando cultivos...</p>
        </div>
      ) : (
        <div className="overflow-hidden bg-card border border-border rounded-3xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-accent/30">
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60 w-10"></th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60">Nombre</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60">Variedades</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60">Alcance</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60">Estado</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground/60 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredCultivos?.map(cultivo => (
                  <Fragment key={cultivo.id}>
                    <tr className={`group transition-colors ${cultivo.activo ? 'hover:bg-accent/10' : 'bg-muted/30 opacity-70'}`}>
                      <td className="px-4 py-4 text-center">
                        {cultivo.variedades.length > 0 && (
                          <button onClick={() => toggleExpand(cultivo.id)} className="p-1 hover:bg-accent rounded-md transition-colors">
                            {expandedCrops.has(cultivo.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 font-bold">{cultivo.nombre}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-muted-foreground bg-accent px-2 py-1 rounded-lg">
                          {cultivo.variedades.length} variedades
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {cultivo.idEmpresa === null ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase"><Globe size={10} /> Global</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 text-[10px] font-black uppercase tracking-wider">
                            <Sprout size={12} />
                            {(isSysAdmin || isAsesor) ? (
                              `${empresas.find(e => e.id === cultivo.idEmpresa)?.nombre || 'Empresa'} (ID: ${cultivo.idEmpresa})`
                            ) : 'Mi Empresa'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-black uppercase ${cultivo.activo ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                          {cultivo.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {isEditable(cultivo) ? (
                            <>
                              <button onClick={() => handleOpenVarietyModal(cultivo)} className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all shadow-xs" title="Agregar Variedad">
                                <Plus size={16} />
                              </button>
                              <button onClick={() => handleOpenModal(cultivo)} className="p-2 rounded-xl bg-accent text-primary hover:bg-primary hover:text-white transition-all shadow-xs">
                                <Pencil size={16} />
                              </button>
                              <button onClick={() => handleToggleActivo(cultivo, 'cultivo')} className={`p-2 rounded-xl bg-accent transition-all ${cultivo.activo ? 'text-emerald-500 hover:bg-emerald-500 hover:text-white' : 'text-muted-foreground hover:bg-destructive hover:text-white'}`}>
                                {updatingIds.has(cultivo.id) ? <Loader2 size={16} className="animate-spin" /> : cultivo.activo ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                              </button>
                            </>
                          ) : <Lock size={16} className="text-muted-foreground mx-auto" />}
                        </div>
                      </td>
                    </tr>
                    {expandedCrops.has(cultivo.id) && (
                      <tr>
                        <td colSpan={6} className="px-12 py-4 bg-accent/5">
                          <div className="space-y-2 border-l-2 border-primary/20 pl-6 py-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Variedades de {cultivo.nombre}</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {cultivo.variedades.map(v => (
                                <div key={v.id} className={`flex items-center justify-between p-3 bg-card border border-border rounded-xl shadow-sm ${!v.activo ? 'opacity-50' : ''}`}>
                                  <div className="flex items-center gap-2">
                                    <Layers size={14} className="text-muted-foreground" />
                                    <span className="text-sm font-semibold">{v.nombre}</span>
                                    {!v.activo && <span className="text-[8px] font-black uppercase text-destructive">Inactivo</span>}
                                  </div>
                                  {isEditable(cultivo) && (
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => handleOpenVarietyModal(cultivo, v)} className="p-1 hover:text-primary transition-colors"><Pencil size={12} /></button>
                                      <button onClick={() => handleToggleActivo(v, 'variedad')} className={`transition-colors ${v.activo ? 'text-emerald-500 hover:text-emerald-600' : 'text-muted-foreground hover:text-emerald-500'}`}>
                                        {v.activo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {filteredCultivos?.length === 0 && (
            <div className="p-12 text-center">
              <Sprout className="size-12 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No se encontraron cultivos.</p>
            </div>
          )}
        </div>
      )}

      {/* Cultivo Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-card border border-border shadow-2xl rounded-3xl overflow-hidden animate-in fade-in zoom-in">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h2 className="text-xl font-black uppercase tracking-tight">{editingCultivo ? 'Editar Cultivo' : 'Nuevo Cultivo'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-accent rounded-full text-muted-foreground"><X size={20} /></button>
            </div>
            <form className="p-6 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">Nombre</label>
                <input type="text" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required className="w-full px-4 py-3 bg-accent/10 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">Descripción</label>
                <textarea value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} rows={3} className="w-full px-4 py-3 bg-accent/10 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none resize-none" />
              </div>
              {isSysAdmin && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">Empresa Destino</label>
                  <select value={formData.idEmpresa === null ? "" : formData.idEmpresa} onChange={(e) => setFormData({ ...formData, idEmpresa: e.target.value === "" ? null : parseInt(e.target.value) })} className="w-full px-4 py-3 bg-accent/10 border border-border rounded-xl outline-none font-bold">
                    <option value="">Global (Todas las empresas)</option>
                    {empresas?.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border border-border rounded-xl font-bold">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:shadow-lg transition-all">
                  {editingCultivo ? 'Guardar Cambios' : 'Crear Cultivo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Variety Modal */}
      {isVarietyModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/90" onClick={() => setIsVarietyModalOpen(false)} />
          <div className="relative w-full max-w-sm bg-card border border-border shadow-2xl rounded-3xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <div className="p-6 border-b border-border flex justify-between items-center bg-primary/5">
              <h2 className="text-lg font-black uppercase tracking-tight">
                {editingVariedad ? 'Editar Variedad' : 'Nueva Variedad'}
              </h2>
              <button onClick={() => setIsVarietyModalOpen(false)} className="p-2 hover:bg-accent rounded-full text-muted-foreground"><X size={20} /></button>
            </div>
            <form className="p-6 space-y-4" onSubmit={handleVarietySubmit}>
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase text-primary/60 px-1">Para: {cultivos.find(c => c.id === variedadFormData.idCultivo)?.nombre}</p>
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">Nombre de la Variedad</label>
                <input type="text" value={variedadFormData.nombre} onChange={(e) => setVariedadFormData({ ...variedadFormData, nombre: e.target.value })} required autoFocus className="w-full px-4 py-3 bg-accent/10 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none font-bold" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsVarietyModalOpen(false)} className="flex-1 py-3 border border-border rounded-xl font-bold text-sm">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:shadow-lg transition-all">
                  {editingVariedad ? 'Guardar' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
