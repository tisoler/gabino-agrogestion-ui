import { useState, useMemo } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  Plus, Building2, ChevronDown, ChevronRight, Mail,
  UserCog, Tractor, AlertCircle, Activity, X, Shield,
  UserPlus, UserMinus, Search, Check, Pencil, Phone,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { Roles, getRoleLabel } from '../constantes'

interface UsuarioBasico {
  uid: string
  email: string | null
  nombreUsuario: string | null
  photoURL: string | null
  celular: string | null
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

// El nombre ya viene capitalizado desde el BE (transformer de Empresa.nombre).

function getRoleBadge(roles: string[]) {
  if (roles.includes(Roles.ASESOR)) return { label: 'Asesor', cls: 'bg-info-soft text-info' }
  if (roles.includes(Roles.ASESOR_ADMIN)) return { label: 'Asesor admin', cls: 'bg-warning-soft text-warning-foreground' }
  if (roles.includes(Roles.PRODUCTOR)) return { label: 'Productor', cls: 'bg-primary-soft text-primary' }
  return { label: getRoleLabel(roles) || '—', cls: 'bg-muted text-muted-foreground' }
}

/**
 * Ícono de WhatsApp para el botón de chat. El link `wa.me` abre WhatsApp Web
 * en desktop y la app nativa en celular.
 */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  )
}

const waLink = (celular: string) => `https://wa.me/${celular.replace(/\D/g, '')}`

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

  // Modal de edición de empresa (nombre)
  const [editEmpresaModal, setEditEmpresaModal] = useState<{ id: number; nombre: string } | null>(null)
  const [empresaNombreValue, setEmpresaNombreValue] = useState('')
  const [empresaSaving, setEmpresaSaving] = useState(false)

  // Modal de edición de usuario (nombre + celular/WhatsApp)
  const [editUsuarioModal, setEditUsuarioModal] = useState<{ uid: string; nombre: string; celular: string } | null>(null)
  const [editNombreValue, setEditNombreValue] = useState('')
  const [editCelularValue, setEditCelularValue] = useState('')
  const [editUsuarioSaving, setEditUsuarioSaving] = useState(false)

  const { permisos, isSysAdmin, isAsesorAdmin, currentEmpresa, user } = useAuth()
  const { mutate: mutateGlobal } = useSWRConfig()
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
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      const message =
        e?.response?.data?.message ||
        e?.message ||
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

  const openEditEmpresaModal = (empresa: EmpresaConUsuarios) => {
    setEditEmpresaModal({ id: empresa.id, nombre: empresa.nombre })
    setEmpresaNombreValue(empresa.nombre)
    setActionError(null)
  }

  const closeEditEmpresaModal = () => {
    setEditEmpresaModal(null)
    setEmpresaNombreValue('')
  }

  const saveEmpresaNombre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editEmpresaModal) return
    const nombre = empresaNombreValue.trim()
    if (!nombre) return
    setEmpresaSaving(true)
    setActionError(null)
    try {
      await api.patch(`/empresas/${editEmpresaModal.id}`, { nombre })
      closeEditEmpresaModal()
      await mutate()
      mutateGlobal('/empresas')
    } catch (err) {
      const errRes = err as { response?: { data?: { message?: string } }; message?: string }
      setActionError(
        errRes?.response?.data?.message ||
        errRes?.message ||
        'No se pudo guardar el nombre del productor',
      )
    } finally {
      setEmpresaSaving(false)
    }
  }

  const openEditUsuarioModal = (u: UsuarioBasico) => {
    const nombre = u.nombreUsuario || u.email || u.uid
    setEditUsuarioModal({
      uid: u.uid,
      nombre,
      celular: u.celular || '',
    })
    setEditNombreValue(nombre)
    setEditCelularValue(u.celular || '')
    setActionError(null)
  }

  const closeEditUsuarioModal = () => {
    setEditUsuarioModal(null)
    setEditNombreValue('')
    setEditCelularValue('')
  }

  const saveUsuario = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editUsuarioModal) return
    setEditUsuarioSaving(true)
    setActionError(null)
    try {
      const nombre = editNombreValue.trim()
      const celular = editCelularValue.trim()
      const nombreCambio = nombre !== '' && nombre !== editUsuarioModal.nombre.trim()
      const celularCambio = celular !== (editUsuarioModal.celular || '')
      if (nombreCambio) {
        await api.patch(`/usuarios/${editUsuarioModal.uid}/nombre`, { nombre })
      }
      if (celularCambio) {
        await api.patch(`/usuarios/${editUsuarioModal.uid}/celular`, { celular })
      }
      closeEditUsuarioModal()
      if (nombreCambio || celularCambio) {
        await mutate()
      }
    } catch (err) {
      const errRes = err as { response?: { data?: { message?: string } }; message?: string }
      setActionError(
        errRes?.response?.data?.message ||
        errRes?.message ||
        'No se pudo guardar los cambios del usuario',
      )
    } finally {
      setEditUsuarioSaving(false)
    }
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
  }, [allUsers, data, addModalEmpresaId, addSearch, user, isAdmin])

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
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center cursor-pointer"
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
            <p className="font-medium">No se pudo completar la acción</p>
            <p className="text-xs mt-0.5">{actionError}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-destructive/70 hover:text-destructive cursor-pointer"
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
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => toggleExpand(empresa.id)}
                    className="flex-1 flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors text-left cursor-pointer min-w-0"
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
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => openEditEmpresaModal(empresa)}
                      className="px-3.5 flex items-center text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors cursor-pointer"
                      title="Editar nombre del productor"
                      aria-label={`Editar nombre de ${empresa.nombre}`}
                    >
                      <Pencil className="size-4" strokeWidth={1.75} />
                    </button>
                  )}
                </div>

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
                              onEdit={canWrite ? () => openEditUsuarioModal(u) : undefined}
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
                              onEdit={canWrite ? () => openEditUsuarioModal(u) : undefined}
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
                              onEdit={canWrite ? () => openEditUsuarioModal(u) : undefined}
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-dashed border-border rounded-md text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
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
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
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
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer hover:bg-muted/30 transition-colors ${selected ? 'bg-primary-soft/40' : ''
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
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
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
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0 cursor-pointer"
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

      {/* Modal: Editar nombre del productor */}
      {editEmpresaModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => !empresaSaving && closeEditEmpresaModal()}
            aria-hidden
          />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-base font-semibold text-foreground">Editar productor</h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Productor: <span className="font-medium text-foreground">{editEmpresaModal.nombre}</span>
                </p>
              </div>
              <button
                onClick={closeEditEmpresaModal}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                disabled={empresaSaving}
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <form className="p-5 space-y-4" onSubmit={saveEmpresaNombre}>
              <div className="space-y-1.5">
                <label htmlFor="empresa-nombre-edit" className="text-xs font-medium text-foreground">
                  Nombre
                </label>
                <input
                  id="empresa-nombre-edit"
                  type="text"
                  value={empresaNombreValue}
                  onChange={(e) => setEmpresaNombreValue(e.target.value)}
                  placeholder="Ej: Establecimiento La Pradera"
                  required
                  maxLength={200}
                  autoFocus
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
                <p className="text-[11px] text-muted-foreground">
                  Se guarda con la primera letra de cada palabra en mayúscula (excepto &laquo;y&raquo;).
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeEditEmpresaModal}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                  disabled={empresaSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  disabled={empresaSaving || !empresaNombreValue.trim()}
                >
                  {empresaSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar usuario (nombre + celular WhatsApp) */}
      {editUsuarioModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => !editUsuarioSaving && closeEditUsuarioModal()}
            aria-hidden
          />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-base font-semibold text-foreground">Editar usuario</h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Usuario: <span className="font-medium text-foreground">{editUsuarioModal.nombre}</span>
                </p>
              </div>
              <button
                onClick={closeEditUsuarioModal}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                disabled={editUsuarioSaving}
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <form className="p-5 space-y-4" onSubmit={saveUsuario}>
              <div className="space-y-1.5">
                <label htmlFor="usuario-nombre-edit" className="text-xs font-medium text-foreground">
                  Nombre
                </label>
                <input
                  id="usuario-nombre-edit"
                  type="text"
                  value={editNombreValue}
                  onChange={(e) => setEditNombreValue(e.target.value)}
                  placeholder="Nombre y apellido"
                  required
                  maxLength={120}
                  autoFocus
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
                <p className="text-[11px] text-muted-foreground">
                  Se guarda en el perfil del usuario (Firestore).
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="celular-edit" className="text-xs font-medium text-foreground">
                  Celular (WhatsApp)
                </label>
                <input
                  id="celular-edit"
                  type="tel"
                  value={editCelularValue}
                  onChange={(e) => setEditCelularValue(e.target.value)}
                  placeholder="+54 9 11 1234 5678"
                  maxLength={32}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
                <p className="text-[11px] text-muted-foreground">
                  Se usa para abrir un chat de WhatsApp. Dejar vacío y guardar para borrarlo.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeEditUsuarioModal}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                  disabled={editUsuarioSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  disabled={editUsuarioSaving}
                >
                  {editUsuarioSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
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
  onEdit?: () => void
  isPending: boolean
}

function UsuarioCard({ usuario, onRemove, onEdit, isPending }: UsuarioCardProps) {
  const badge = getRoleBadge(usuario.roles)
  const nombreVisible = usuario.nombreUsuario || usuario.email || usuario.uid
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
            {nombreVisible}
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
        {usuario.celular && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <Phone className="size-3 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{usuario.celular}</span>
          </p>
        )}
      </div>
      {usuario.celular ? (
        <a
          href={waLink(usuario.celular)}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md text-muted-foreground hover:bg-success-soft hover:text-success transition-colors shrink-0"
          title={`Enviar mensaje de WhatsApp a ${nombreVisible}`}
          aria-label={`Enviar mensaje de WhatsApp a ${nombreVisible}`}
        >
          <WhatsAppIcon className="size-3.5" />
        </a>
      ) : (
        <button
          type="button"
          disabled
          className="p-1.5 rounded-md text-muted-foreground/40 shrink-0 cursor-not-allowed"
          title="Sin celular cargado"
          aria-label={`Enviar mensaje de WhatsApp a ${nombreVisible} (sin celular cargado)`}
        >
          <WhatsAppIcon className="size-3.5" />
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 cursor-pointer"
          title="Editar usuario (nombre y celular)"
          aria-label={`Editar a ${nombreVisible}`}
        >
          <Pencil className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={isPending}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
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
