import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  Plus, Building2, ChevronDown, ChevronRight, Mail,
  UserCog, Tractor, AlertCircle, Activity, X, Shield,
  UserPlus, UserMinus, Search,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Roles } from '../constantes'

interface UsuarioBasico {
  uid: string
  email: string | null
  nombreUsuario: string | null
  photoURL: string | null
  roles: string[]
  idEmpresas: number[]
}

interface EmpresaConUsuarios {
  id: number
  nombre: string
  activo: boolean
  createdAt?: string
  updatedAt?: string
  usuarios: UsuarioBasico[]
}

const fetcher = (url: string) => api.get(url).then((r) => r.data)

function getInitials(name: string | null | undefined) {
  if (!name) return '?'
  return name
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
}

export default function Productores() {
  const [searchTerm, setSearchTerm] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  // Modal de "agregar usuario a empresa"
  const [addModalEmpresaId, setAddModalEmpresaId] = useState<number | null>(null)
  const [addSearch, setAddSearch] = useState('')
  const [pendingUid, setPendingUid] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { permisos, isSysAdmin, currentEmpresa } = useAuth()
  const canRead = permisos.includes('lectura:productor')
  const canWrite = permisos.includes('escritura:empresa')

  const { data, isLoading, mutate } = useSWR<EmpresaConUsuarios[]>(
    canRead ? '/empresas/with-users' : null,
    fetcher
  )

  // Catálogo global de usuarios (deduplicado por uid) a partir de la respuesta
  // agrupada. Sirve como fuente para los candidatos del modal de "agregar".
  const allUsers = useMemo<UsuarioBasico[]>(() => {
    if (!data) return []
    const map = new Map<string, UsuarioBasico>()
    for (const empresa of data) {
      for (const user of empresa.usuarios) {
        if (!map.has(user.uid)) map.set(user.uid, user)
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.nombreUsuario || a.email || a.uid).localeCompare(
        b.nombreUsuario || b.email || b.uid,
      ),
    )
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const term = searchTerm.trim().toLowerCase()
    if (!term) return data
    return data
      .map((empresa) => {
        const matchesEmpresa = empresa.nombre.toLowerCase().includes(term)
        const matchesUsuario = empresa.usuarios.some(
          (u) =>
            (u.nombreUsuario?.toLowerCase() || '').includes(term) ||
            (u.email?.toLowerCase() || '').includes(term),
        )
        if (!matchesEmpresa && !matchesUsuario) return null
        return {
          ...empresa,
          usuarios: matchesEmpresa
            ? empresa.usuarios
            : empresa.usuarios.filter(
                (u) =>
                  (u.nombreUsuario?.toLowerCase() || '').includes(term) ||
                  (u.email?.toLowerCase() || '').includes(term),
              ),
        }
      })
      .filter((x): x is EmpresaConUsuarios => x !== null)
  }, [data, searchTerm])

  const totalAsesores = useMemo(
    () => (data || []).reduce((acc, e) => acc + e.usuarios.filter((u) => u.roles.includes(Roles.ASESOR)).length, 0),
    [data],
  )
  const totalProductores = useMemo(
    () => (data || []).reduce((acc, e) => acc + e.usuarios.filter((u) => u.roles.includes(Roles.PRODUCTOR)).length, 0),
    [data],
  )

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      await api.post('/empresas', { nombre: newName.trim() })
      setNewName('')
      setIsCreateOpen(false)
      mutate()
    } catch (err) {
      console.error('Error al crear empresa', err)
    } finally {
      setCreating(false)
    }
  }

  const updateUserEmpresas = async (
    uid: string,
    payload: { add?: number[]; remove?: number[] },
  ) => {
    setPendingUid(uid)
    setActionError(null)
    try {
      await api.patch(`/usuarios/${uid}/empresas`, payload)
      await mutate()
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'No se pudo actualizar la asociación'
      setActionError(message)
    } finally {
      setPendingUid(null)
    }
  }

  const handleRemove = (uid: string, empresaId: number, nombre: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`¿Desasociar a ${nombre} de esta empresa?`)) {
      return
    }
    updateUserEmpresas(uid, { remove: [empresaId] })
  }

  const openAddModal = (empresaId: number) => {
    setAddModalEmpresaId(empresaId)
    setAddSearch('')
    setActionError(null)
  }

  const closeAddModal = () => {
    setAddModalEmpresaId(null)
    setAddSearch('')
  }

  const handleAdd = (uid: string) => {
    if (addModalEmpresaId == null) return
    updateUserEmpresas(uid, { add: [addModalEmpresaId] })
  }

  const candidatesForModal = useMemo(() => {
    if (addModalEmpresaId == null) return []
    const inEmpresa = new Set(
      (data?.find((e) => e.id === addModalEmpresaId)?.usuarios ?? []).map((u) => u.uid),
    )
    const term = addSearch.trim().toLowerCase()
    return allUsers
      .filter((u) => !inEmpresa.has(u.uid))
      .filter((u) => {
        if (!term) return true
        return (
          (u.nombreUsuario?.toLowerCase() || '').includes(term) ||
          (u.email?.toLowerCase() || '').includes(term) ||
          u.uid.toLowerCase().includes(term)
        )
      })
  }, [allUsers, data, addModalEmpresaId, addSearch])

  const addModalEmpresa = data?.find((e) => e.id === addModalEmpresaId)

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          No tienes permisos para ver esta sección.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Productores</h1>
            {isSysAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                <Shield className="size-3" strokeWidth={2} />
                Global Admin
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Empresas y sus usuarios (asesores y productores)
          </p>
          {currentEmpresa && !isSysAdmin && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Empresa actual: <span className="font-medium text-foreground">{currentEmpresa}</span>
            </p>
          )}
        </div>

        {canWrite && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nueva Empresa</span>
          </button>
        )}
      </div>

      {actionError && (
        <div role="alert" className="bg-destructive-soft border border-destructive/20 text-destructive text-sm rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="size-4 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="flex-1">
            <p className="font-medium">No se pudo actualizar la asociación</p>
            <p className="text-xs mt-0.5">{actionError}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-destructive/70 hover:text-destructive"
            aria-label="Cerrar"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Empresas</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{data.length}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Asesores</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{totalAsesores}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Productores</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{totalProductores}</p>
          </div>
        </div>
      )}

      <div className="bg-card/60 border border-border rounded-lg p-3">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Buscar por empresa, asesor o productor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando empresas y usuarios...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border">
          <Building2 className="size-10 text-muted-foreground/40 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            {searchTerm ? 'No se encontraron empresas con esos criterios.' : 'No hay empresas asignadas a tu usuario.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((empresa) => {
            const isOpen = expanded.has(empresa.id)
            const asesores = empresa.usuarios.filter((u) => u.roles.includes(Roles.ASESOR))
            const productores = empresa.usuarios.filter((u) => u.roles.includes(Roles.PRODUCTOR))
            return (
              <div key={empresa.id} className="bg-card border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpand(empresa.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
                  aria-expanded={isOpen}
                >
                  <div className="size-9 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
                    <Building2 className="size-5" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold text-foreground leading-tight truncate">
                        {empresa.nombre}
                      </h2>
                      {!empresa.activo && (
                        <span className="px-1.5 py-0.5 bg-destructive-soft text-destructive text-[10px] font-semibold uppercase tracking-wider rounded">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {asesores.length} {asesores.length === 1 ? 'asesor' : 'asesores'} ·{' '}
                      {productores.length} {productores.length === 1 ? 'productor' : 'productores'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded">
                        <UserCog className="size-3" strokeWidth={1.75} />
                        {asesores.length}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded">
                        <Tractor className="size-3" strokeWidth={1.75} />
                        {productores.length}
                      </span>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="size-4 text-muted-foreground" strokeWidth={1.75} />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.75} />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
                    {asesores.length > 0 && (
                      <div>
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                          Asesores ({asesores.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {asesores.map((u) => (
                            <UsuarioCard
                              key={u.uid}
                              usuario={u}
                              empresaId={empresa.id}
                              onRemove={canWrite ? () => handleRemove(u.uid, empresa.id, u.nombreUsuario || u.email || u.uid) : undefined}
                              isPending={pendingUid === u.uid}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {productores.length > 0 && (
                      <div>
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                          Productores ({productores.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {productores.map((u) => (
                            <UsuarioCard
                              key={u.uid}
                              usuario={u}
                              empresaId={empresa.id}
                              onRemove={canWrite ? () => handleRemove(u.uid, empresa.id, u.nombreUsuario || u.email || u.uid) : undefined}
                              isPending={pendingUid === u.uid}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {empresa.usuarios.length === 0 && (
                      <p className="text-sm text-muted-foreground px-1">
                        Aún no hay usuarios vinculados a esta empresa.
                      </p>
                    )}

                    {canWrite && (
                      <div className="pt-2 border-t border-border/50">
                        <button
                          type="button"
                          onClick={() => openAddModal(empresa.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-dashed border-border rounded-md text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                        >
                          <UserPlus className="size-3.5" strokeWidth={1.75} />
                          Agregar usuario
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Nueva Empresa */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => !creating && setIsCreateOpen(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">Nueva Empresa</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                disabled={creating}
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <form className="p-5 space-y-4" onSubmit={handleCreate}>
              <div className="space-y-1.5">
                <label htmlFor="empresa-nombre" className="text-xs font-medium text-foreground">
                  Nombre
                </label>
                <input
                  id="empresa-nombre"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej: Establecimiento La Pradera"
                  required
                  maxLength={200}
                  autoFocus
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
                <p className="text-[11px] text-muted-foreground">
                  La asignación de usuarios a esta empresa se realiza desde el sistema de identidad.
                </p>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={creating || !newName.trim()}
                >
                  {creating ? 'Creando…' : 'Crear empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Agregar usuario a empresa */}
      {addModalEmpresaId != null && addModalEmpresa && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={closeAddModal}
            aria-hidden
          />
          <div className="relative w-full max-w-lg bg-card border border-border rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-base font-semibold text-foreground">Agregar usuario</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Empresa destino: <span className="font-medium text-foreground">{addModalEmpresa.nombre}</span>
                </p>
              </div>
              <button
                onClick={closeAddModal}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="p-4 border-b border-border shrink-0">
              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
                <input
                  type="text"
                  placeholder="Buscar por nombre, email o UID..."
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {candidatesForModal.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {addSearch
                    ? 'No hay coincidencias.'
                    : 'Todos los usuarios disponibles ya están asociados a esta empresa.'}
                </p>
              ) : (
                candidatesForModal.map((u) => (
                  <div
                    key={u.uid}
                    className="flex items-center gap-3 p-2.5 bg-card border border-border rounded-md"
                  >
                    <div
                      className={`size-8 rounded-md flex items-center justify-center text-xs font-semibold shrink-0 ${
                        u.roles.includes(Roles.ASESOR)
                          ? 'bg-info-soft text-info'
                          : 'bg-primary-soft text-primary'
                      }`}
                    >
                      {getInitials(u.nombreUsuario || u.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">
                          {u.nombreUsuario || u.email || u.uid}
                        </p>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            u.roles.includes(Roles.ASESOR)
                              ? 'bg-info-soft text-info'
                              : 'bg-primary-soft text-primary'
                          }`}
                        >
                          {u.roles.includes(Roles.ASESOR) ? 'Asesor' : 'Productor'}
                        </span>
                      </div>
                      {u.email && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <Mail className="size-3 shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{u.email}</span>
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdd(u.uid)}
                      disabled={pendingUid === u.uid}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                    >
                      {pendingUid === u.uid ? (
                        <Activity className="size-3 animate-spin" />
                      ) : (
                        <UserPlus className="size-3" strokeWidth={2} />
                      )}
                      <span>Agregar</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3 border-t border-border bg-muted/30 shrink-0">
              <p className="text-[11px] text-muted-foreground">
                {candidatesForModal.length} usuario{candidatesForModal.length === 1 ? '' : 's'} disponible{candidatesForModal.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface UsuarioCardProps {
  usuario: UsuarioBasico
  empresaId: number
  onRemove?: () => void
  isPending: boolean
}

function UsuarioCard({ usuario, onRemove, isPending }: UsuarioCardProps) {
  const isAsesor = usuario.roles.includes(Roles.ASESOR)
  const isProductor = usuario.roles.includes(Roles.PRODUCTOR)
  return (
    <div className="flex items-center gap-3 p-2.5 bg-card border border-border rounded-md">
      <div
        className={`size-8 rounded-md flex items-center justify-center text-xs font-semibold shrink-0 ${
          isAsesor
            ? 'bg-info-soft text-info'
            : isProductor
            ? 'bg-primary-soft text-primary'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {getInitials(usuario.nombreUsuario || usuario.email)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">
            {usuario.nombreUsuario || usuario.email || usuario.uid}
          </p>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
              isAsesor ? 'bg-info-soft text-info' : 'bg-primary-soft text-primary'
            }`}
          >
            {isAsesor ? 'Asesor' : isProductor ? 'Productor' : '—'}
          </span>
        </div>
        {usuario.email && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <Mail className="size-3 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{usuario.email}</span>
          </p>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={isPending}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors disabled:opacity-50 shrink-0"
          title="Desasociar de esta empresa"
          aria-label="Desasociar de esta empresa"
        >
          {isPending ? (
            <Activity className="size-3.5 animate-spin" />
          ) : (
            <UserMinus className="size-3.5" strokeWidth={1.75} />
          )}
        </button>
      )}
    </div>
  )
}
