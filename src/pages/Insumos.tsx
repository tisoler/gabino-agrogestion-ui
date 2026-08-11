import { useState, useMemo, useEffect } from 'react'
import useSWR from 'swr'
import {
  Plus, Search, Pencil, Package, Activity, Database,
  Lock, AlertCircle, Globe, X, Shield, ToggleLeft, ToggleRight, Loader2, Tag, FolderPlus
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { UNIDADES_PRECIO } from '../constantes'
import { useCotizacionDolar, fmtPrecio, type Moneda } from '../lib/moneda'
import { setMonedaGlobal } from '../lib/monedaStore'
import MonedaToggle from '../components/MonedaToggle'

interface Categoria {
  id: number
  nombre: string
  descripcion: string | null
  activo: boolean
}

interface Insumo {
  id: number
  nombre: string
  descripcion: string | null
  idCategoria: number | null
  categoria?: Categoria | null
  idEmpresa: number | null
  precioUnitario?: number | null
  unidad?: string | null
  activo: boolean
  createdAt?: string
  updatedAt?: string
}

export default function Insumos() {
  const [searchTerm, setSearchTerm] = useState('')

  const [moneda, setMoneda] = useState<Moneda>('pesos')
  const { venta } = useCotizacionDolar()
  const dolar = venta
  useEffect(() => { setMonedaGlobal(moneda, 'venta') }, [moneda])

  // Alcance unificado para todos los roles: todas | global | por empresa
  const [scope, setScope] = useState<'todas' | 'global' | 'empresa'>('todas')
  const [scopeEmpresaId, setScopeEmpresaId] = useState<number | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingInsumo, setEditingInsumo] = useState<Insumo | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    idCategoria: null as number | null,
    idEmpresa: null as number | null,
    unidad: '' as string
  })
  const [precioUnitario, setPrecioUnitario] = useState('')

  const [isCategoriaModalOpen, setIsCategoriaModalOpen] = useState(false)
  const [categoriaFormData, setCategoriaFormData] = useState({
    nombre: '',
    descripcion: ''
  })
  const [categoriaBusy, setCategoriaBusy] = useState(false)
  const [categoriaError, setCategoriaError] = useState<string | null>(null)

  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  const { permisos, isSysAdmin, isAsesor, isAsesorAdmin, isProductor, empresas, currentEmpresaId, user } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const userEmpresas = (user?.idEmpresas || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
  // Empresas visibles en el alcance "Por empresa": admins ven todas, el resto solo sus asociadas
  const scopeEmpresas = isAdmin ? empresas : empresas.filter((e) => userEmpresas.includes(e.id))
  const canWrite = permisos.includes('escritura:insumo')
  const canRead = permisos.includes('lectura:insumo') && !isProductor
  const canManageCategorias = isSysAdmin || isAsesorAdmin

  const insumosFetcher = async ([url, empresaId, scopeSel]: [string, number | boolean, string]) => {
    const params: any = {}
    if (scopeSel === 'global') {
      params.scope = 'global'
    } else if (scopeSel === 'empresa' && empresaId) {
      params.scope = 'empresa'
      params.currentEmpresaId = Number(empresaId)
    }

    const res = await api.get(url, { params })
    return res.data
  }

  const swrInsumosKey = canRead
    ? ['insumos', scope === 'empresa' ? (scopeEmpresaId || 0) : false, scope]
    : null

  const { data: insumos = [], isLoading, mutate } = useSWR<Insumo[]>(
    swrInsumosKey,
    insumosFetcher as any,
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      dedupingInterval: 0,
    }
  )

  const { data: categorias = [], mutate: mutateCategorias } = useSWR<Categoria[]>(
    canRead ? '/categorias' : null,
    fetcher
  )

  const filteredInsumos = useMemo(() => {
    return insumos
      ?.filter(i =>
        i.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.descripcion?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (i.categoria?.nombre || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
      ?.toSorted((a, b) => {
        if (a.idEmpresa !== b.idEmpresa) {
          if (a.idEmpresa === null) return -1
          if (b.idEmpresa === null) return 1
          return a.idEmpresa - b.idEmpresa
        }
        return a.nombre.localeCompare(b.nombre)
      })
  }, [insumos, searchTerm])

  const handleOpenModal = (insumo: Insumo | null = null) => {
    if (insumo) {
      setEditingInsumo(insumo)
      setFormData({
        nombre: insumo.nombre,
        descripcion: insumo.descripcion || '',
        idCategoria: insumo.idCategoria ?? null,
        idEmpresa: insumo.idEmpresa,
        unidad: insumo.unidad || ''
      })
      setPrecioUnitario(insumo.precioUnitario != null ? String(insumo.precioUnitario) : '')
    } else {
      setEditingInsumo(null)
      setFormData({
        nombre: '',
        descripcion: '',
        idCategoria: null,
        idEmpresa: isAdmin ? null : (currentEmpresaId || userEmpresas[0] || null),
        unidad: ''
      })
      setPrecioUnitario('')
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const payload = {
      ...formData,
      precioUnitario: precioUnitario.trim() === '' ? null : parseFloat(precioUnitario),
      unidad: formData.unidad || null
    }
    try {
      if (editingInsumo) {
        await api.patch(`/insumos/${editingInsumo.id}`, payload)
      } else {
        await api.post('/insumos', payload)
      }
      setIsModalOpen(false)
      mutate()
    } catch (err) {
      console.error('Error al guardar insumo', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateCategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoriaFormData.nombre.trim() || categoriaBusy) return
    setCategoriaBusy(true)
    setCategoriaError(null)
    try {
      const { data } = await api.post('/categorias', {
        nombre: categoriaFormData.nombre.trim(),
        descripcion: categoriaFormData.descripcion || undefined,
      })
      const nuevaCategoria = data as Categoria
      setFormData((prev) => ({ ...prev, idCategoria: nuevaCategoria.id }))
      setCategoriaFormData({ nombre: '', descripcion: '' })
      setIsCategoriaModalOpen(false)
      // Actualiza el cache de categorías de forma síncrona para que la opción
      // exista en el mismo render en que se fija el valor del select. Sin esto,
      // el select controlado queda con un valor sin <option> hasta que el
      // refetch termine y React rompe al insertar el option ("insertBefore").
      await mutateCategorias(
        (prev: Categoria[] | undefined): Categoria[] => {
          const lista = Array.isArray(prev) ? prev : []
          if (lista.some((c) => c.id === nuevaCategoria.id)) return lista
          return [...lista, nuevaCategoria].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        },
        { revalidate: false },
      )
    } catch (err) {
      const e = err as { response?: { data?: { message?: string | string[] } } }
      const msg = e?.response?.data?.message
      setCategoriaError(
        Array.isArray(msg) ? msg.join(', ') :
          typeof msg === 'string' ? msg :
            'No se pudo crear la categoría.'
      )
    } finally {
      setCategoriaBusy(false)
    }
  }

  const handleToggleActivo = async (insumo: Insumo) => {
    setUpdatingIds(prev => new Set(prev).add(insumo.id))
    try {
      await api.patch(`/insumos/${insumo.id}`, { activo: !insumo.activo })
      await mutate()
    } catch (err) {
      console.error('Error al cambiar estado del insumo', err)
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev)
        next.delete(insumo.id)
        return next
      })
    }
  }

  const isEditable = (insumo: Insumo) => {
    if (!canWrite) return false
    if (isAdmin) return true
    return insumo.idEmpresa !== null
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
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Insumos</h1>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                <Shield className="size-3" strokeWidth={2} />
                Admin
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo maestro de productos y agroinsumos</p>
        </div>

        <div className="flex items-center gap-2">
          <MonedaToggle value={moneda} onChange={setMoneda} />
          {canWrite && (
            <button
              onClick={() => handleOpenModal()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
            >
              <Plus className="size-4" strokeWidth={2} />
              <span>Nuevo Insumo</span>
            </button>
          )}
        </div>
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
            <select
              aria-label="Productor"
              value={scopeEmpresaId ?? ''}
              onChange={(e) => setScopeEmpresaId(e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className="px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              <option value="">Seleccionar productor</option>
              {scopeEmpresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          )}
          {scope === 'empresa' && !scopeEmpresaId && (
            <span className="text-xs text-muted-foreground">Elegí un productor para ver solo sus insumos.</span>
          )}
        </div>
      </div>

      <div className="bg-card/60 border border-border rounded-lg p-3">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Buscar por nombre o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando insumos...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {filteredInsumos?.map((insumo) => {
              const editable = isEditable(insumo)
              return (
                <div
                  key={insumo.id}
                  className={`bg-card border border-border rounded-lg p-4 space-y-3 transition-opacity ${!insumo.activo ? 'opacity-60' : ''
                    }`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-foreground leading-tight">{insumo.nombre}</h3>
                        {insumo.idEmpresa === null && (
                          <span title="Insumo global">
                            <Globe className="size-3.5 text-info" strokeWidth={2} />
                          </span>
                        )}
                        {!insumo.activo && (
                          <span className="px-1.5 py-0.5 bg-destructive-soft text-destructive text-[10px] font-semibold uppercase tracking-wider rounded">
                            Inactivo
                          </span>
                        )}
                      </div>
                      {insumo.descripcion && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{insumo.descripcion}</p>
                      )}
                      {insumo.precioUnitario != null && (
                        <p className="text-sm font-medium text-success mt-0.5">
                          {fmtPrecio(insumo.precioUnitario, moneda, dolar)}
                          {insumo.unidad ? ` / ${insumo.unidad}` : ''}
                        </p>
                      )}
                      {insumo.categoria && (
                        <div className="mt-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent border border-border text-[11px] font-medium text-foreground rounded">
                            <Tag className="size-3" strokeWidth={1.75} />
                            {insumo.categoria.nombre}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {editable ? (
                        <>
                          <button
                            onClick={() => handleOpenModal(insumo)}
                            className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors"
                            disabled={updatingIds.has(insumo.id)}
                            aria-label="Editar"
                          >
                            <Pencil className="size-3.5" strokeWidth={1.75} />
                          </button>
                          <button
                            onClick={() => handleToggleActivo(insumo)}
                            className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${insumo.activo
                              ? 'text-success hover:bg-success-soft'
                              : 'text-muted-foreground hover:bg-muted'
                              }`}
                            title={insumo.activo ? 'Desactivar' : 'Activar'}
                            disabled={updatingIds.has(insumo.id)}
                            aria-label={insumo.activo ? 'Desactivar' : 'Activar'}
                          >
                            {updatingIds.has(insumo.id) ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : insumo.activo ? (
                              <ToggleRight className="size-4" strokeWidth={1.75} />
                            ) : (
                              <ToggleLeft className="size-4" strokeWidth={1.75} />
                            )}
                          </button>
                        </>
                      ) : (
                        <span
                          className="p-1.5 rounded-md bg-muted text-muted-foreground"
                          title="Este insumo es global y no puede ser editado"
                        >
                          <Lock className="size-3.5" strokeWidth={1.75} />
                        </span>
                      )}
                    </div>
                  </div>

                  {(isAdmin || isAsesor) && insumo.idEmpresa !== null && (
                    <div className="pt-2 border-t border-border text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Package className="size-3" strokeWidth={1.75} />
                      <span>Productor: {empresas.find((e) => e.id === insumo.idEmpresa)?.nombre || `ID: ${insumo.idEmpresa}`}</span>
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
                      Categoría
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Descripción
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-1/6">
                      Precio
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Unidad
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
                  {filteredInsumos?.map((insumo) => {
                    const editable = isEditable(insumo)
                    return (
                      <tr
                        key={insumo.id}
                        className={`transition-colors ${insumo.activo ? 'hover:bg-muted/40' : 'bg-muted/20 opacity-60'}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`font-medium ${insumo.activo ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {insumo.nombre}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {insumo.categoria ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent border border-border text-[11px] font-medium text-foreground rounded">
                              <Tag className="size-3" strokeWidth={1.75} />
                              {insumo.categoria.nombre}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground line-clamp-1">{insumo.descripcion || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">
                            {insumo.precioUnitario != null
                              ? `${fmtPrecio(insumo.precioUnitario, moneda, dolar)}${insumo.unidad ? ` / ${insumo.unidad}` : ''}`
                              : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{insumo.unidad || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {insumo.idEmpresa === null ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-info-soft text-info text-[10px] font-semibold uppercase tracking-wider rounded">
                              <Globe className="size-3" strokeWidth={2} />
                              Global
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-soft text-warning-foreground text-[10px] font-semibold uppercase tracking-wider rounded">
                              <Package className="size-3" strokeWidth={2} />
                              {isAdmin || isAsesor
                                ? `${empresas.find((e) => e.id === insumo.idEmpresa)?.nombre || 'Productor'} · ${insumo.idEmpresa}`
                                : 'Mi productor'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${insumo.activo
                              ? 'bg-success-soft text-success'
                              : 'bg-destructive-soft text-destructive'
                              }`}
                          >
                            {insumo.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex justify-end gap-1">
                            {editable ? (
                              <>
                                <button
                                  onClick={() => handleOpenModal(insumo)}
                                  className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors"
                                  title="Editar"
                                  aria-label="Editar"
                                >
                                  <Pencil className="size-3.5" strokeWidth={1.75} />
                                </button>
                                <button
                                  onClick={() => handleToggleActivo(insumo)}
                                  className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${insumo.activo
                                    ? 'text-success hover:bg-success-soft'
                                    : 'text-muted-foreground hover:bg-muted'
                                    }`}
                                  title={insumo.activo ? 'Desactivar' : 'Activar'}
                                  disabled={updatingIds.has(insumo.id)}
                                  aria-label={insumo.activo ? 'Desactivar' : 'Activar'}
                                >
                                  {updatingIds.has(insumo.id) ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : insumo.activo ? (
                                    <ToggleRight className="size-4" strokeWidth={1.75} />
                                  ) : (
                                    <ToggleLeft className="size-4" strokeWidth={1.75} />
                                  )}
                                </button>
                              </>
                            ) : (
                              <span
                                className="p-1.5 rounded-md bg-muted text-muted-foreground inline-flex"
                                title="Este insumo es global y no puede ser editado"
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
            {filteredInsumos?.length === 0 && (
              <div className="p-12 text-center">
                <Database className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">No se encontraron insumos.</p>
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
                {editingInsumo ? 'Editar Insumo' : 'Nuevo Insumo'}
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
                <label htmlFor="insumo-nombre" className="text-xs font-medium text-foreground">
                  Nombre
                </label>
                <input
                  id="insumo-nombre"
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Urea 46%"
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="insumo-categoria" className="text-xs font-medium text-foreground">
                  Categoría
                </label>
                <div className="flex gap-2">
                  <select
                    id="insumo-categoria"
                    value={formData.idCategoria ?? ''}
                    onChange={(e) =>
                      setFormData({ ...formData, idCategoria: e.target.value === '' ? null : parseInt(e.target.value) })
                    }
                    required
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                  >
                    <option value="">Seleccionar categoría...</option>
                    {formData.idCategoria != null &&
                      !categorias.some((c) => c.id === formData.idCategoria) && (
                        <option value={formData.idCategoria}>Categoría nueva</option>
                      )}
                    {categorias
                      .filter((c) => c.activo || c.id === formData.idCategoria)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                  </select>
                  {canManageCategorias && (
                    <button
                      type="button"
                      onClick={() => { setCategoriaError(null); setIsCategoriaModalOpen(true) }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors shrink-0"
                      title="Crear nueva categoría"
                      aria-label="Crear nueva categoría"
                    >
                      <FolderPlus className="size-4" strokeWidth={1.75} />
                      <span className="hidden sm:inline">Nueva</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Las categorías son globales; sólo sys-admin o asesor-admin pueden crear nuevas.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="insumo-descripcion" className="text-xs font-medium text-foreground">
                  Descripción
                </label>
                <textarea
                  id="insumo-descripcion"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  placeholder="Detalles adicionales del insumo..."
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="insumo-precio" className="text-xs font-medium text-foreground">
                  Precio referencia (en pesos $)
                </label>
                <input
                  id="insumo-precio"
                  type="number"
                  min="0"
                  step="0.01"
                  value={precioUnitario}
                  onChange={(e) => setPrecioUnitario(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="insumo-unidad" className="text-xs font-medium text-foreground">
                  Unidad
                </label>
                <select
                  id="insumo-unidad"
                  value={formData.unidad}
                  onChange={(e) => setFormData({ ...formData, unidad: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors cursor-pointer"
                >
                  <option value="">Sin unidad</option>
                  {UNIDADES_PRECIO.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {isAdmin && (
                <div className="space-y-1.5">
                  <label htmlFor="insumo-empresa" className="text-xs font-medium text-foreground">
                    Productor
                  </label>
                  <select
                    id="insumo-empresa"
                    value={formData.idEmpresa === null ? '' : String(formData.idEmpresa)}
                    onChange={(e) =>
                      setFormData({ ...formData, idEmpresa: e.target.value === '' ? null : parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                  >
                    <option value="">Global (todos los productores)</option>
                    {formData.idEmpresa != null &&
                      !empresas?.some((e) => e.id === formData.idEmpresa) && (
                        <option value={String(formData.idEmpresa)}>Productor {formData.idEmpresa}</option>
                      )}
                    {empresas?.map((e) => (
                      <option key={e.id} value={String(e.id)}>{e.nombre}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Solo como sys-admin puedes crear insumos globales o asignarlos a otros productores.
                  </p>
                </div>
              )}
              {!isAdmin && userEmpresas.length > 1 && (
                <div className="space-y-1.5">
                  <label htmlFor="insumo-empresa" className="text-xs font-medium text-foreground">
                    Productor
                  </label>
                  <select
                    id="insumo-empresa"
                    value={formData.idEmpresa === null ? '' : String(formData.idEmpresa)}
                    onChange={(e) =>
                      setFormData({ ...formData, idEmpresa: e.target.value === '' ? null : parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                    required
                  >
                    <option value="">Seleccionar productor</option>
                    {formData.idEmpresa != null &&
                      !empresas?.some((e) => e.id === formData.idEmpresa && userEmpresas.includes(e.id)) && (
                        <option value={String(formData.idEmpresa)}>Productor {formData.idEmpresa}</option>
                      )}
                    {empresas
                      .filter((e) => userEmpresas.includes(e.id))
                      .map((e) => (
                        <option key={e.id} value={String(e.id)}>{e.nombre}</option>
                      ))}
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
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {editingInsumo ? 'Guardando…' : 'Creando…'}
                    </>
                  ) : (
                    editingInsumo ? 'Guardar cambios' : 'Crear Insumo'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCategoriaModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => { if (!categoriaBusy) setIsCategoriaModalOpen(false) }}
            aria-hidden
          />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">Nueva Categoría de Insumo</h2>
              <button
                onClick={() => setIsCategoriaModalOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <form className="p-5 space-y-4" onSubmit={handleCreateCategoria}>
              <div className="space-y-1.5">
                <label htmlFor="categoria-nombre" className="text-xs font-medium text-foreground">Nombre</label>
                <input
                  id="categoria-nombre"
                  type="text"
                  value={categoriaFormData.nombre}
                  onChange={(e) => { setCategoriaFormData({ ...categoriaFormData, nombre: e.target.value }); setCategoriaError(null) }}
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="categoria-descripcion" className="text-xs font-medium text-foreground">Descripción</label>
                <textarea
                  id="categoria-descripcion"
                  value={categoriaFormData.descripcion}
                  onChange={(e) => setCategoriaFormData({ ...categoriaFormData, descripcion: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors resize-none"
                />
              </div>
              {categoriaError && (
                <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                  <AlertCircle className="size-3" strokeWidth={1.75} />
                  {categoriaError}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCategoriaModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!categoriaFormData.nombre.trim() || categoriaBusy}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {categoriaBusy && <Loader2 className="size-4 animate-spin" />}
                  {categoriaBusy ? 'Creando...' : 'Crear categoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
