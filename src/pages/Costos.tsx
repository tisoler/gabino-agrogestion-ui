import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  Plus, Search, Pencil, DollarSign, Activity,
  Lock, AlertCircle, Globe, X, Shield, ToggleLeft, ToggleRight, Loader2, Package
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

interface Costo {
  id: number
  nombre: string
  descripcion: string | null
  idEmpresa: number | null
  precioUnitario?: number | null
  activo: boolean
  createdAt?: string
  updatedAt?: string
}

export default function Costos() {
  const [searchTerm, setSearchTerm] = useState('')

  // Alcance unificado para todos los roles: todas | global | por empresa
  const [scope, setScope] = useState<'todas' | 'global' | 'empresa'>('todas')
  const [scopeEmpresaId, setScopeEmpresaId] = useState<number | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCosto, setEditingCosto] = useState<Costo | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    idEmpresa: null as number | null
  })
  const [precioUnitario, setPrecioUnitario] = useState('')

  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set())

  const { permisos, isSysAdmin, isAsesorAdmin, isAsesor, empresas, currentEmpresaId, user } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const userEmpresas = (user?.idEmpresas || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
  // Empresas visibles en el alcance "Por empresa": admins ven todas, el resto solo sus asociadas
  const scopeEmpresas = isAdmin ? empresas : empresas.filter((e) => userEmpresas.includes(e.id))
  const canWrite = permisos.includes('escritura:costo')
  const canRead = permisos.includes('lectura:costo')

  const costosFetcher = async ([url, empresaId, scopeSel]: [string, number | boolean, string]) => {
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

  const swrCostosKey = canRead
    ? ['costos', scope === 'empresa' ? (scopeEmpresaId || 0) : false, scope]
    : null

  const { data: costos = [], isLoading, mutate } = useSWR<Costo[]>(
    swrCostosKey,
    costosFetcher as any,
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
      setPrecioUnitario(costo.precioUnitario != null ? String(costo.precioUnitario) : '')
    } else {
      setEditingCosto(null)
      setFormData({
        nombre: '',
        descripcion: '',
        idEmpresa: isAdmin ? null : (currentEmpresaId || userEmpresas[0] || null)
      })
      setPrecioUnitario('')
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...formData,
      precioUnitario: precioUnitario.trim() === '' ? null : parseFloat(precioUnitario)
    }
    try {
      if (editingCosto) {
        await api.patch(`/costos/${editingCosto.id}`, payload)
      } else {
        await api.post('/costos', payload)
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

  const isEditable = (costo: Costo) => {
    if (!canWrite) return false
    if (isAdmin) return true
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
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                <Shield className="size-3" strokeWidth={2} />
                Admin
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
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  scope === key
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
              aria-label="Empresa"
              value={scopeEmpresaId ?? ''}
              onChange={(e) => setScopeEmpresaId(e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className="px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              <option value="">Seleccionar empresa</option>
              {scopeEmpresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          )}
          {scope === 'empresa' && !scopeEmpresaId && (
            <span className="text-xs text-muted-foreground">Elegí una empresa para ver solo sus costos.</span>
          )}
        </div>
      </div>

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
                      {costo.precioUnitario != null && (
                        <p className="text-sm font-medium text-success mt-0.5">
                          ${Number(costo.precioUnitario).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
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

                  {(isAdmin || isAsesor) && costo.idEmpresa !== null && (
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
                      Precio unitario
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
                          <span className="text-sm text-muted-foreground">
                            {costo.precioUnitario != null ? `$${Number(costo.precioUnitario).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                          </span>
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
                              {isAdmin || isAsesor
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

              <div className="space-y-1.5">
                <label htmlFor="costo-precio" className="text-xs font-medium text-foreground">
                  Precio unitario (referencia)
                </label>
                <input
                  id="costo-precio"
                  type="number"
                  min="0"
                  step="0.01"
                  value={precioUnitario}
                  onChange={(e) => setPrecioUnitario(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
              </div>

{isAdmin && (
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
              {!isAdmin && !editingCosto && userEmpresas.length > 1 && (
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
                    required
                  >
                    <option value="">Seleccionar empresa</option>
                    {empresas
                      .filter((e) => userEmpresas.includes(e.id))
                      .map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
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
