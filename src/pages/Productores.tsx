import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  Plus, Building2, ChevronDown, ChevronRight, Mail,
  UserCog, Tractor, AlertCircle, Activity, X, Shield,
  UserPlus, UserMinus, Search, Check,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Roles, getRoleLabel } from '../constantes'

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

function getRoleBadge(roles: string[]) {
  if (roles.includes(Roles.ASESOR)) return { label: 'Asesor', cls: 'bg-info-soft text-info' }
  if (roles.includes(Roles.ASESOR_ADMIN)) return { label: 'Asesor admin', cls: 'bg-warning-soft text-warning-foreground' }
  if (roles.includes(Roles.PRODUCTOR)) return { label: 'Productor', cls: 'bg-primary-soft text-primary' }
  return { label: getRoleLabel(roles) || '—', cls: 'bg-muted text-muted-foreground' }
}

export default function Productores() {
  const [searchTerm, setSearchTerm] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createSearch, setCreateSearch] = useState('')
  const [createSelectedUids, setCreateSelectedUids] = useState<string[]>([])

  // Modal de "agregar usuario a empresa"
  const [addModalEmpresaId, setAddModalEmpresaId] = useState<number | null>(null)
  const [addSearch, setAddSearch] = useState('')
  const [pendingUid, setPendingUid] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { permisos, isSysAdmin, isAsesorAdmin, currentEmpresa, user } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const canRead = permisos.includes('lectura:productor')
  // Productor no puede crear empresas ni asociar/desasociar usuarios: sólo es asociado.
  const canWrite = permisos.includes('escritura:empresa') && !user?.roles?.includes(Roles.PRODUCTOR)

  const { data, isLoading, mutate } = useSWR<EmpresaConUsuarios[]>(
    canRead ? '/empresas/with-users' : null,
    fetcher
  )

  // Catálogo de usuarios candidatos: TODOS los usuarios de Firebase con
  // cualquier rol excepto sys-admin, sin importar si tienen idEmpresas.
  const { data: candidatos } = useSWR<UsuarioBasico[]>(
    canWrite ? '/usuarios/candidatos' : null,
    fetcher
  )

  const allUsers = useMemo<UsuarioBasico[]>(() => {
    const list = candidatos || []
    return [...list].sort((a, b) =>
      (a.nombreUsuario || a.email || a.uid).localeCompare(
        b.nombreUsuario || b.email || b.uid,
      ),
    )
  }, [candidatos])

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
    () => (data || []).reduce(
      (acc, e) => acc + e.usuarios.filter((u) => u.roles.includes(Roles.ASESOR) || u.roles.includes(Roles.ASESOR_ADMIN)).length,
      0,
    ),
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
      const res = await api.post('/empresas', { nombre: newName.trim() })
      const nuevaEmpresaId = Number(res.data?.id)
      if (nuevaEmpresaId > 0 && createSelectedUids.length > 0) {
        for (const uid of createSelectedUids) {
          await api.patch(`/usuarios/${uid}/empresas`, { add: [nuevaEmpresaId] })
        }
      }
      setNewName('')
      setCreateSearch('')
      setCreateSelectedUids([])
      setIsCreateOpen(false)
      mutate()
    } catch (err) {
      console.error('Error al crear productor', err)
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
    if (!isAdmin && uid === user?.id) {
      setActionError('No podés desasociarte a vos mismo de un productor.')
      return
    }
    if (typeof window !== 'undefined' && !window.confirm(`¿Desasociar a ${nombre} de este productor?`)) {
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

  const matchesSearch = (u: UsuarioBasico, term: string) => {
    if (!term) return true
    return (
      (u.nombreUsuario?.toLowerCase() || '').includes(term) ||
      (u.email?.toLowerCase() || '').includes(term) ||
      u.uid.toLowerCase().includes(term)
    )
  }

  const candidatesForModal = useMemo(() => {
    if (addModalEmpresaId == null) return []
    const inEmpresa = new Set(
      (data?.find((e) => e.id === addModalEmpresaId)?.usuarios ?? []).map((u) => u.uid),
    )
    const term = addSearch.trim().toLowerCase()
    return allUsers
      .filter((u) => isAdmin || u.uid !== user?.id)
      .filter((u) => !inEmpresa.has(u.uid))
      .filter((u) => matchesSearch(u, term))
  }, [allUsers, data, addModalEmpresaId, addSearch, user])

  const addModalEmpresa = data?.find((e) => e.id === addModalEmpresaId)

  const createCandidates = useMemo(() => {
    const term = createSearch.trim().toLowerCase()
    return allUsers
      .filter((u) => isAdmin || u.uid !== user?.id)
      .filter((u) => matchesSearch(u, term))
  }, [allUsers, createSearch, user, isAdmin])

  const toggleCreateUser = (uid: string) => {
    setCreateSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    )
  }

  // Un usuario no-admin no puede desasociarse a sí mismo de una empresa.
  const canRemoveUser = (uid: string) => canWrite && !(!isAdmin && uid === user?.id)

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
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                <Shield className="size-3" strokeWidth={2} />
                Admin
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Productores y sus usuarios (asesores y productores)
          </p>
          {currentEmpresa && !isAdmin && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Productor actual: <span className="font-medium text-foreground">{currentEmpresa}</span>
            </p>
          )}
        </div>

        {canWrite && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nuevo Productor</span>
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
          <div className="bg-primary-soft border border-primary/30 rounded-lg p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Productores (unidades de negocio)</p>
            <p className="text-2xl font-semibold text-primary mt-1">{data.length}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Usuarios asesores</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{totalAsesores}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Usuarios productores</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{totalProductores}</p>
          </div>
        </div>
      )}

      <div className="bg-card/60 border border-border rounded-lg p-3">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Buscar por productor, asesor o usuario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando productores y usuarios...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border">
          <Building2 className="size-10 text-muted-foreground/40 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            {searchTerm ? 'No se encontraron productores con esos criterios.' : 'No hay productores asignados a tu usuario.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((empresa) => {
            const isOpen = expanded.has(empresa.id)
            const asesores = empresa.usuarios.filter((u) => u.roles.includes(Roles.ASESOR))
            const asesoresAdmin = empresa.usuarios.filter((u) => u.roles.includes(Roles.ASESOR_ADMIN))
            const productores = empresa.usuarios.filter((u) => u.roles.includes(Roles.PRODUCTOR))
            const totalAsesoresEmpresa = asesores.length + asesoresAdmin.length
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
                      {totalAsesoresEmpresa} {totalAsesoresEmpresa === 1 ? 'asesor' : 'asesores'} ·{' '}
                      {productores.length} {productores.length === 1 ? 'productor' : 'productores'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded">
                        <UserCog className="size-3" strokeWidth={1.75} />
                        {totalAsesoresEmpresa}
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
                              onRemove={canRemoveUser(u.uid) ? () => handleRemove(u.uid, empresa.id, u.nombreUsuario || u.email || u.uid) : undefined}
                              isPending={pendingUid === u.uid}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {asesoresAdmin.length > 0 && (
                      <div>
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                          Asesores admin ({asesoresAdmin.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {asesoresAdmin.map((u) => (
                            <UsuarioCard
                              key={u.uid}
                              usuario={u}
                              empresaId={empresa.id}
                              onRemove={canRemoveUser(u.uid) ? () => handleRemove(u.uid, empresa.id, u.nombreUsuario || u.email || u.uid) : undefined}
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
                              onRemove={canRemoveUser(u.uid) ? () => handleRemove(u.uid, empresa.id, u.nombreUsuario || u.email || u.uid) : undefined}
                              isPending={pendingUid === u.uid}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {empresa.usuarios.length === 0 && (
                      <p className="text-sm text-muted-foreground px-1">
                        Aún no hay usuarios vinculados a este productor.
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
          <div className="relative w-full max-w-lg bg-card border border-border rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center shrink-0">
              <h2 className="text-base font-semibold text-foreground">Nuevo Productor</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                disabled={creating}
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <form className="p-5 space-y-4 overflow-y-auto" onSubmit={handleCreate}>
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
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">
                    Usuarios a asociar
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    {createSelectedUids.length} seleccionado{createSelectedUids.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="relative group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
                  <input
                    type="text"
                    value={createSearch}
                    onChange={(e) => setCreateSearch(e.target.value)}
                    placeholder="Buscar por nombre, email o UID..."
                    className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto border border-border rounded-md divide-y divide-border bg-background">
                  {createCandidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6 px-4">
                      {createSearch
                        ? 'No hay coincidencias.'
                        : 'No hay usuarios disponibles para asociar.'}
                    </p>
                  ) : (
                    createCandidates.map((u) => {
                      const selected = createSelectedUids.includes(u.uid)
                      const badge = getRoleBadge(u.roles)
                      return (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() => toggleCreateUser(u.uid)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/30 transition-colors ${selected ? 'bg-primary-soft/40' : ''
                            }`}
                        >
                          <div
                            className={`size-7 rounded-md flex items-center justify-center text-xs font-semibold shrink-0 ${badge.cls}`}
                          >
                            {getInitials(u.nombreUsuario || u.email)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {u.nombreUsuario || u.email || u.uid}
                            </p>
                            {u.email && (
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            )}
                          </div>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          <div
                            className={`size-5 rounded border flex items-center justify-center shrink-0 ${selected
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-border'
                              }`}
                          >
                            {selected && <Check className="size-3.5" strokeWidth={2.5} />}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {createCandidates.length} usuario{createCandidates.length === 1 ? '' : 's'} disponible{createCandidates.length === 1 ? '' : 's'} (sin sys-admins)
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
                  {creating ? 'Creando…' : 'Crear productor'}
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
                  Productor: <span className="font-medium text-foreground">{addModalEmpresa.nombre}</span>
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
                    : 'Todos los usuarios disponibles ya están asociados a este productor.'}
                </p>
              ) : (
                candidatesForModal.map((u) => {
                  const badge = getRoleBadge(u.roles)
                  return (
                    <div
                      key={u.uid}
                      className="flex items-center gap-3 p-2.5 bg-card border border-border rounded-md"
                    >
                      <div
                        className={`size-8 rounded-md flex items-center justify-center text-xs font-semibold shrink-0 ${badge.cls}`}
                      >
                        {getInitials(u.nombreUsuario || u.email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-foreground truncate">
                            {u.nombreUsuario || u.email || u.uid}
                          </p>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.cls}`}
                          >
                            {badge.label}
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
                  )
                })
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
  const badge = getRoleBadge(usuario.roles)
  return (
    <div className="flex items-center gap-3 p-2.5 bg-card border border-border rounded-md">
      <div
        className={`size-8 rounded-md flex items-center justify-center text-xs font-semibold shrink-0 ${badge.cls}`}
      >
        {getInitials(usuario.nombreUsuario || usuario.email)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">
            {usuario.nombreUsuario || usuario.email || usuario.uid}
          </p>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.cls}`}
          >
            {badge.label}
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
          title="Desasociar de este productor"
          aria-label="Desasociar de este productor"
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
