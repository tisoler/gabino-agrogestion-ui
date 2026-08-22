import { useState, useMemo, Fragment } from 'react'
import useSWR from 'swr'
import {
  Plus, Search, Pencil, Sprout, Activity,
  Lock, AlertCircle, Globe, ChevronDown, X, Shield, ToggleLeft, ToggleRight, Loader2,
  Layers, ChevronUp
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import SelectAutocomplete from '../components/SelectAutocomplete'

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

  // Alcance unificado para todos los roles: todas | global | por empresa
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
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const { permisos, isSysAdmin, isAsesorAdmin, isAsesor, isProductor, empresas, currentEmpresaId, user } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const userEmpresas = (user?.idEmpresas || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
  // Empresas visibles en el alcance "Por empresa": admins ven todas, el resto solo sus asociadas
  const scopeEmpresas = isAdmin ? empresas : empresas.filter((e) => userEmpresas.includes(e.id))
  const canWrite = permisos.includes('escritura:cultivo')
  const canRead = permisos.includes('lectura:cultivo') && !isProductor

  const cultivosFetcher = async ([url, empresaId, scopeSel]: [string, number | boolean, string]) => {
    const params: Record<string, unknown> = {}
    if (scopeSel === 'global') {
      params.scope = 'global'
    } else if (scopeSel === 'empresa' && empresaId) {
      params.scope = 'empresa'
      params.currentEmpresaId = Number(empresaId)
    }

    const res = await api.get(url, { params })
    return res.data
  }

  const swrCultivosKey: [string, number | boolean, string] | null = canRead
    ? ['cultivos', scope === 'empresa' ? (scopeEmpresaId || 0) : false, scope]
    : null

  const { data: cultivos = [], isLoading, mutate } = useSWR<Cultivo[]>(
    swrCultivosKey,
    cultivosFetcher,
    { revalidateOnFocus: false }
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
    setFormError(null)
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
    if (saving) return
    setSaving(true)
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
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      setFormError(e?.response?.data?.message || e?.message || 'No se pudo guardar el cultivo')
    } finally {
      setSaving(false)
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nuevo Cultivo</span>
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alcance</span>
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {([
              ['todas', 'Todas'],
              ['global', 'Global'],
              ['empresa', 'Por productor'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${scope === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-foreground hover:bg-muted'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
          {scope === 'empresa' && scopeEmpresas.length > 0 && (
            <SelectAutocomplete
              value={scopeEmpresaId ?? ''}
              onChange={(v) => setScopeEmpresaId(v === '' ? null : Number(v))}
              options={scopeEmpresas.map((e) => ({ value: e.id, label: e.nombre }))}
              placeholder="Seleccionar productor"
            />
          )}
          {scope === 'empresa' && !scopeEmpresaId && (
            <span className="text-xs text-muted-foreground">Elegí un productor para ver solo sus cultivos.</span>
          )}
        </div>
      </div>

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
        <>
          {/* Mobile: cards */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {filteredCultivos?.map((cultivo) => (
              <div
                key={cultivo.id}
                className={`bg-card border border-border rounded-lg p-4 space-y-3 ${!cultivo.activo ? 'bg-muted/20 opacity-60' : ''
                  }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <h3 className="text-base font-semibold text-foreground leading-tight truncate min-w-0">
                    {cultivo.nombre}
                  </h3>
                  {cultivo.variedades.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleExpand(cultivo.id) }}
                      className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 cursor-pointer"
                      aria-label={expandedCrops.has(cultivo.id) ? 'Contraer' : 'Expandir'}
                    >
                      {expandedCrops.has(cultivo.id) ? (
                        <ChevronUp className="size-4" strokeWidth={1.75} />
                      ) : (
                        <ChevronDown className="size-4" strokeWidth={1.75} />
                      )}
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${cultivo.activo
                      ? 'bg-success-soft text-success'
                      : 'bg-destructive-soft text-destructive'
                      }`}
                  >
                    {cultivo.activo ? 'Activo' : 'Inactivo'}
                  </span>
                  {cultivo.idEmpresa === null ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-info-soft text-info text-[10px] font-semibold uppercase tracking-wider rounded">
                      <Globe className="size-3" strokeWidth={2} />
                      Global
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-soft text-warning-foreground text-[10px] font-semibold uppercase tracking-wider rounded">
                      <Sprout className="size-3" strokeWidth={2} />
                      {isAdmin || isAsesor
                        ? `${empresas.find((e) => e.id === cultivo.idEmpresa)?.nombre || 'Productor'} · ${cultivo.idEmpresa}`
                        : 'Mi productor'}
                    </span>
                  )}
                  {cultivo.tipoCosecha && (
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${cultivo.tipoCosecha === 'fina'
                      ? 'bg-info-soft text-info'
                      : 'bg-warning-soft text-warning-foreground'
                      }`}>
                      {cultivo.tipoCosecha === 'fina' ? 'Fina' : 'Gruesa'}
                    </span>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Variedades</dt>
                    <dd>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {cultivo.variedades.length} {cultivo.variedades.length === 1 ? 'variedad' : 'variedades'}
                      </span>
                    </dd>
                  </div>
                </dl>

                {expandedCrops.has(cultivo.id) && (
                  <div className="space-y-2 border-l-2 border-primary/30 pl-4 py-1">
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Variedades de {cultivo.nombre}
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                      {cultivo.variedades.map((v) => (
                        <div
                          key={v.id}
                          className={`flex items-center justify-between p-2.5 bg-card border border-border rounded-md ${!v.activo ? 'opacity-60' : ''
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
                                onClick={(e) => { e.stopPropagation(); handleOpenVarietyModal(cultivo, v) }}
                                className="p-1 rounded text-primary hover:bg-primary-soft transition-colors cursor-pointer"
                                title="Editar"
                                aria-label="Editar"
                              >
                                <Pencil className="size-3" strokeWidth={1.75} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleActivo(v, 'variedad') }}
                                className={`p-1 rounded cursor-pointer transition-colors ${v.activo
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
                )}

                <div className="pt-2 border-t border-border flex justify-between items-center">
                  {isEditable(cultivo) ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenVarietyModal(cultivo) }}
                        className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors cursor-pointer"
                        title="Agregar variedad"
                        aria-label="Agregar variedad"
                      >
                        <Plus className="size-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenModal(cultivo) }}
                        className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors cursor-pointer"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <Pencil className="size-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleActivo(cultivo, 'cultivo') }}
                        className={`p-1.5 rounded-md cursor-pointer transition-colors ${cultivo.activo
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
                    </div>
                  ) : (
                    <span className="p-1.5 rounded-md bg-muted text-muted-foreground inline-flex" title="Solo lectura">
                      <Lock className="size-3.5" strokeWidth={1.75} />
                    </span>
                  )}
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
                            className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
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
                          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${cultivo.tipoCosecha === 'fina'
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
                              ? `${empresas.find((e) => e.id === cultivo.idEmpresa)?.nombre || 'Productor'} · ${cultivo.idEmpresa}`
                              : 'Mi productor'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${cultivo.activo
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
                                className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors cursor-pointer"
                                title="Agregar variedad"
                                aria-label="Agregar variedad"
                              >
                                <Plus className="size-3.5" strokeWidth={1.75} />
                              </button>
                              <button
                                onClick={() => handleOpenModal(cultivo)}
                                className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors cursor-pointer"
                                title="Editar"
                                aria-label="Editar"
                              >
                                <Pencil className="size-3.5" strokeWidth={1.75} />
                              </button>
                              <button
                                onClick={() => handleToggleActivo(cultivo, 'cultivo')}
                                className={`p-1.5 rounded-md cursor-pointer transition-colors ${cultivo.activo
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
                                  className={`flex items-center justify-between p-2.5 bg-card border border-border rounded-md ${!v.activo ? 'opacity-60' : ''
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
                                        className="p-1 rounded text-primary hover:bg-primary-soft transition-colors cursor-pointer"
                                        title="Editar"
                                        aria-label="Editar"
                                      >
                                        <Pencil className="size-3" strokeWidth={1.75} />
                                      </button>
                                      <button
                                        onClick={() => handleToggleActivo(v, 'variedad')}
                                        className={`p-1 rounded cursor-pointer transition-colors ${v.activo
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
                {editingCultivo ? 'Editar Cultivo' : 'Nuevo Cultivo'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
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
                <SelectAutocomplete
                  value={formData.tipoCosecha}
                  onChange={(v) => setFormData({ ...formData, tipoCosecha: String(v) as '' | 'fina' | 'gruesa' })}
                  options={[
                    { value: '', label: 'Sin especificar' },
                    { value: 'fina', label: 'Fina' },
                    { value: 'gruesa', label: 'Gruesa' }
                  ]}
                />
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <label htmlFor="cultivo-empresa" className="text-xs font-medium text-foreground">Productor</label>
                  <SelectAutocomplete
                    value={formData.idEmpresa === null ? '' : String(formData.idEmpresa)}
                    onChange={(v) => setFormData({ ...formData, idEmpresa: v === '' ? null : Number(v) })}
                    options={[
                      { value: '', label: 'Global (todos los productores)' },
                      ...(formData.idEmpresa != null && !empresas?.some((e) => e.id === formData.idEmpresa)
                        ? [{ value: String(formData.idEmpresa), label: `Productor ${formData.idEmpresa}` }]
                        : []),
                      ...empresas.map((e) => ({ value: String(e.id), label: e.nombre }))
                    ]}
                  />
                </div>
              )}
              {!isAdmin && userEmpresas.length > 1 && (
                <div className="space-y-1.5">
                  <label htmlFor="cultivo-empresa" className="text-xs font-medium text-foreground">Productor</label>
                  <SelectAutocomplete
                    value={formData.idEmpresa === null ? '' : String(formData.idEmpresa)}
                    onChange={(v) => setFormData({ ...formData, idEmpresa: v === '' ? null : Number(v) })}
                    options={[
                      { value: '', label: 'Seleccionar productor' },
                      ...(formData.idEmpresa != null && !empresas?.some((e) => e.id === formData.idEmpresa && userEmpresas.includes(e.id))
                        ? [{ value: String(formData.idEmpresa), label: `Productor ${formData.idEmpresa}` }]
                        : []),
                      ...empresas.filter((e) => userEmpresas.includes(e.id)).map((e) => ({ value: String(e.id), label: e.nombre }))
                    ]}
                  />
                </div>
              )}
              {formError && (
                <p className="text-xs text-destructive inline-flex items-center gap-1.5 bg-destructive-soft border border-destructive/20 rounded-md px-3 py-2">
                  <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {formError}
                </p>
              )}
              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {editingCultivo ? 'Guardando…' : 'Creando…'}
                    </>
                  ) : (
                    editingCultivo ? 'Guardar cambios' : 'Crear Cultivo'
                  )}
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
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
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
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
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
