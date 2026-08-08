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
  tipoCosecha: 'fina' | 'gruesa' | null
  idEmpresa: number | null
  activo: boolean
  variedades: Variedad[]
}

export default function Cultivos() {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCrops, setExpandedCrops] = useState<Set<number>>(new Set())

  const [showAll, setShowAll] = useState(false)
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // Alcance para asesor / productor: todas | global | por empresa
  const [scope, setScope] = useState<'todas' | 'global' | 'empresa'>('todas')
  const [scopeEmpresaId, setScopeEmpresaId] = useState<number | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCultivo, setEditingCultivo] = useState<Cultivo | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    tipoCosecha: '' as '' | 'fina' | 'gruesa',
    idEmpresa: null as number | null
  })

  const [isVarietyModalOpen, setIsVarietyModalOpen] = useState(false)
  const [editingVariedad, setEditingVariedad] = useState<Variedad | null>(null)
  const [variedadFormData, setVariedadFormData] = useState({
    nombre: '',
    idCultivo: 0
  })

  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set())

  const { permisos, isSysAdmin, isAsesorAdmin, isAsesor, empresas, currentEmpresaId, user } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const userEmpresas = (user?.idEmpresas || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
  const canWrite = permisos.includes('escritura:cultivo')
  const canRead = permisos.includes('lectura:cultivo')

  const cultivosFetcher = async ([url, all, third, fourth]: [string, boolean, string | number | boolean, string | number]) => {
    const params: any = {}
    if (isAdmin) {
      if (all) params.all = true
      if (typeof third === 'string' && third) params.companyIds = third
    } else if (fourth === 'global') {
      params.scope = 'global'
    } else if (fourth === 'empresa' && third) {
      params.scope = 'empresa'
      params.currentEmpresaId = Number(third)
    } else {
      params.all = true
    }

    const res = await api.get(url, { params })
    return res.data
  }

  const swrCultivosKey = canRead
    ? isAdmin
      ? ['cultivos', showAll, selectedCompanies.join(','), '']
      : ['cultivos', false, scope === 'empresa' ? (scopeEmpresaId || 0) : false, scope]
    : null

  const { data: cultivos = [], isLoading, mutate } = useSWR<Cultivo[]>(
    swrCultivosKey,
    cultivosFetcher as any,
    { revalidateOnFocus: true }
  )

  const filteredCultivos = useMemo(() => {
    return cultivos
      ?.filter(c =>
        c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.descripcion?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        c.variedades.some((v) => v.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
      )
      ?.toSorted((a, b) => {
        if (a.idEmpresa !== b.idEmpresa) {
          if (a.idEmpresa === null) return -1
          if (b.idEmpresa === null) return 1
          return a.idEmpresa - b.idEmpresa
        }
        return a.nombre.localeCompare(b.nombre)
      })
  }, [cultivos, searchTerm])

  const handleOpenModal = (cultivo: Cultivo | null = null) => {
    if (cultivo) {
      setEditingCultivo(cultivo)
      setFormData({
        nombre: cultivo.nombre,
        descripcion: cultivo.descripcion || '',
        tipoCosecha: cultivo.tipoCosecha || '',
        idEmpresa: cultivo.idEmpresa
      })
    } else {
      setEditingCultivo(null)
      setFormData({
        nombre: '',
        descripcion: '',
        tipoCosecha: '',
        idEmpresa: isAdmin ? null : (currentEmpresaId || userEmpresas[0] || null)
      })
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        ...formData,
        tipoCosecha: formData.tipoCosecha || null
      }
      if (editingCultivo) {
        await api.patch(`/cultivos/${editingCultivo.id}`, payload)
      } else {
        await api.post('/cultivos', payload)
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
    if (isAdmin) return true
    return item.idEmpresa !== null
  }

  const toggleCompanySelection = (id: number) => {
    setSelectedCompanies((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
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
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Cultivos</h1>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                <Shield className="size-3" strokeWidth={2} />
                Admin
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo maestro de cultivos y variedades</p>
        </div>

        {canWrite && (
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nuevo Cultivo</span>
          </button>
        )}
      </div>

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
              <span className="text-sm text-foreground">Ver todos los cultivos (incluyendo empresas)</span>
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
        </div>
      )}

      {!isAdmin && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alcance</span>
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              {([
                ['todas', 'Todas'],
                ['global', 'Global'],
                ['empresa', 'Por empresa'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScope(key)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    scope === key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-accent text-foreground hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {scope === 'empresa' && userEmpresas.length > 0 && (
              <select
                value={scopeEmpresaId ?? ''}
                onChange={(e) => setScopeEmpresaId(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                className="px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Seleccionar empresa</option>
                {empresas
                  .filter((e) => userEmpresas.includes(e.id))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
              </select>
            )}
            {scope === 'empresa' && !scopeEmpresaId && (
              <span className="text-xs text-muted-foreground">Elegí una empresa para ver solo sus cultivos.</span>
            )}
          </div>
        </div>
      )}

      <div className="bg-card/60 border border-border rounded-lg p-3">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Buscar por cultivo o variedad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando cultivos...</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-3 w-10" aria-label="Expandir" />
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Nombre
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Tipo Cosecha
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Variedades
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Alcance
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
                {filteredCultivos?.map((cultivo) => (
                  <Fragment key={cultivo.id}>
                    <tr
                      className={`transition-colors ${cultivo.activo ? 'hover:bg-muted/40' : 'bg-muted/20 opacity-60'}`}
                    >
                      <td className="px-3 py-3 text-center">
                        {cultivo.variedades.length > 0 && (
                          <button
                            onClick={() => toggleExpand(cultivo.id)}
                            className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            aria-label={expandedCrops.has(cultivo.id) ? 'Contraer' : 'Expandir'}
                          >
                            {expandedCrops.has(cultivo.id) ? (
                              <ChevronUp className="size-4" strokeWidth={1.75} />
                            ) : (
                              <ChevronDown className="size-4" strokeWidth={1.75} />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{cultivo.nombre}</td>
                      <td className="px-4 py-3">
                        {cultivo.tipoCosecha ? (
                          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
                            cultivo.tipoCosecha === 'fina'
                              ? 'bg-info-soft text-info'
                              : 'bg-warning-soft text-warning-foreground'
                          }`}>
                            {cultivo.tipoCosecha === 'fina' ? 'Fina' : 'Gruesa'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {cultivo.variedades.length} {cultivo.variedades.length === 1 ? 'variedad' : 'variedades'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {cultivo.idEmpresa === null ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-info-soft text-info text-[10px] font-semibold uppercase tracking-wider rounded">
                            <Globe className="size-3" strokeWidth={2} />
                            Global
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-soft text-warning-foreground text-[10px] font-semibold uppercase tracking-wider rounded">
                            <Sprout className="size-3" strokeWidth={2} />
                            {isAdmin || isAsesor
                              ? `${empresas.find((e) => e.id === cultivo.idEmpresa)?.nombre || 'Empresa'} · ${cultivo.idEmpresa}`
                              : 'Mi Empresa'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
                            cultivo.activo
                              ? 'bg-success-soft text-success'
                              : 'bg-destructive-soft text-destructive'
                          }`}
                        >
                          {cultivo.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex justify-end gap-1">
                          {isEditable(cultivo) ? (
                            <>
                              <button
                                onClick={() => handleOpenVarietyModal(cultivo)}
                                className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors"
                                title="Agregar variedad"
                                aria-label="Agregar variedad"
                              >
                                <Plus className="size-3.5" strokeWidth={1.75} />
                              </button>
                              <button
                                onClick={() => handleOpenModal(cultivo)}
                                className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors"
                                title="Editar"
                                aria-label="Editar"
                              >
                                <Pencil className="size-3.5" strokeWidth={1.75} />
                              </button>
                              <button
                                onClick={() => handleToggleActivo(cultivo, 'cultivo')}
                                className={`p-1.5 rounded-md transition-colors ${
                                  cultivo.activo
                                    ? 'text-success hover:bg-success-soft'
                                    : 'text-muted-foreground hover:bg-muted'
                                }`}
                                title={cultivo.activo ? 'Desactivar' : 'Activar'}
                                aria-label={cultivo.activo ? 'Desactivar' : 'Activar'}
                              >
                                {updatingIds.has(cultivo.id) ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : cultivo.activo ? (
                                  <ToggleRight className="size-4" strokeWidth={1.75} />
                                ) : (
                                  <ToggleLeft className="size-4" strokeWidth={1.75} />
                                )}
                              </button>
                            </>
                          ) : (
                            <span className="p-1.5 rounded-md bg-muted text-muted-foreground inline-flex" title="Solo lectura">
                              <Lock className="size-3.5" strokeWidth={1.75} />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedCrops.has(cultivo.id) && (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 bg-muted/30">
                          <div className="space-y-2 border-l-2 border-primary/30 pl-4 py-1">
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Variedades de {cultivo.nombre}
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {cultivo.variedades.map((v) => (
                                <div
                                  key={v.id}
                                  className={`flex items-center justify-between p-2.5 bg-card border border-border rounded-md ${
                                    !v.activo ? 'opacity-60' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Layers className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                                    <span className="text-sm font-medium text-foreground truncate">{v.nombre}</span>
                                    {!v.activo && (
                                      <span className="px-1.5 py-0.5 bg-destructive-soft text-destructive text-[9px] font-semibold uppercase tracking-wider rounded">
                                        Inactivo
                                      </span>
                                    )}
                                  </div>
                                  {isEditable(cultivo) && (
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button
                                        onClick={() => handleOpenVarietyModal(cultivo, v)}
                                        className="p-1 rounded text-primary hover:bg-primary-soft transition-colors"
                                        title="Editar"
                                        aria-label="Editar"
                                      >
                                        <Pencil className="size-3" strokeWidth={1.75} />
                                      </button>
                                      <button
                                        onClick={() => handleToggleActivo(v, 'variedad')}
                                        className={`p-1 rounded transition-colors ${
                                          v.activo
                                            ? 'text-success hover:bg-success-soft'
                                            : 'text-muted-foreground hover:bg-muted'
                                        }`}
                                        title={v.activo ? 'Desactivar' : 'Activar'}
                                        aria-label={v.activo ? 'Desactivar' : 'Activar'}
                                      >
                                        {v.activo ? (
                                          <ToggleRight className="size-4" strokeWidth={1.75} />
                                        ) : (
                                          <ToggleLeft className="size-4" strokeWidth={1.75} />
                                        )}
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
              <Sprout className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No se encontraron cultivos.</p>
            </div>
          )}
        </div>
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
                {editingCultivo ? 'Editar Cultivo' : 'Nuevo Cultivo'}
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
                <label htmlFor="cultivo-nombre" className="text-xs font-medium text-foreground">Nombre</label>
                <input
                  id="cultivo-nombre"
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cultivo-descripcion" className="text-xs font-medium text-foreground">Descripción</label>
                <textarea
                  id="cultivo-descripcion"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cultivo-tipo-cosecha" className="text-xs font-medium text-foreground">Tipo de cosecha</label>
                <select
                  id="cultivo-tipo-cosecha"
                  value={formData.tipoCosecha}
                  onChange={(e) =>
                    setFormData({ ...formData, tipoCosecha: e.target.value as '' | 'fina' | 'gruesa' })
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                >
                  <option value="">Sin especificar</option>
                  <option value="fina">Fina</option>
                  <option value="gruesa">Gruesa</option>
                </select>
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <label htmlFor="cultivo-empresa" className="text-xs font-medium text-foreground">Empresa destino</label>
                  <select
                    id="cultivo-empresa"
                    value={formData.idEmpresa === null ? '' : formData.idEmpresa}
                    onChange={(e) =>
                      setFormData({ ...formData, idEmpresa: e.target.value === '' ? null : parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                  >
                    <option value="">Global (todas las empresas)</option>
                    {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
              )}
              {!isAdmin && !editingCultivo && userEmpresas.length > 1 && (
                <div className="space-y-1.5">
                  <label htmlFor="cultivo-empresa" className="text-xs font-medium text-foreground">Empresa destino</label>
                  <select
                    id="cultivo-empresa"
                    value={formData.idEmpresa === null ? '' : formData.idEmpresa}
                    onChange={(e) =>
                      setFormData({ ...formData, idEmpresa: e.target.value === '' ? null : parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                    required
                  >
                    <option value="">Seleccionar empresa</option>
                    {empresas
                      .filter((e) => userEmpresas.includes(e.id))
                      .map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
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
                  {editingCultivo ? 'Guardar cambios' : 'Crear Cultivo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isVarietyModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setIsVarietyModalOpen(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {editingVariedad ? 'Editar Variedad' : 'Nueva Variedad'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cultivos.find((c) => c.id === variedadFormData.idCultivo)?.nombre}
                </p>
              </div>
              <button
                onClick={() => setIsVarietyModalOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <form className="p-5 space-y-4" onSubmit={handleVarietySubmit}>
              <div className="space-y-1.5">
                <label htmlFor="variedad-nombre" className="text-xs font-medium text-foreground">
                  Nombre de la variedad
                </label>
                <input
                  id="variedad-nombre"
                  type="text"
                  value={variedadFormData.nombre}
                  onChange={(e) => setVariedadFormData({ ...variedadFormData, nombre: e.target.value })}
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
              </div>
              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsVarietyModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
                >
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
