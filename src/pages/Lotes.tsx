import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import useSWR from 'swr'
import {
  Plus, Search, Pencil, MapPin, Activity,
  Lock, AlertCircle, Shield, ToggleLeft, ToggleRight, Loader2, User, X, Check, ChevronDown
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

interface UsuarioBasico {
  uid: string
  email: string | null
  nombreUsuario: string | null
  photoURL: string | null
  roles: string[]
  idEmpresas: number[]
}

interface Lote {
  id: number
  descripcion: string | null
  campo: string
  idUsuario: string
  idEmpresa: number
  lat: number | null
  long: number | null
  activo: boolean
  createdAt?: string
  updatedAt?: string
}

interface LoteFormData {
  descripcion: string
  campo: string
  idUsuario: string
  lat: string
  long: string
  idEmpresa: number | null
}

const emptyForm: LoteFormData = {
  descripcion: '',
  campo: '',
  idUsuario: '',
  lat: '',
  long: '',
  idEmpresa: null,
}

function formatCoord(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(6)
}

function formatCoords(lat: number | null, long: number | null) {
  if (lat === null && long === null) return '—'
  return `${formatCoord(lat)}, ${formatCoord(long)}`
}

const usuariosFetcher = (url: string) => api.get(url).then((r) => r.data)

function CampoFiltro({
  value,
  opciones,
  onChange,
}: {
  value: string[]
  opciones: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (c: string) => {
    onChange(value.includes(c) ? value.filter((v) => v !== c) : [...value, c])
  }

  const resumen =
    value.length === 0 ? 'Todos los campos' : `${value.length} campo${value.length === 1 ? '' : 's'}`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full sm:w-64 flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors cursor-pointer"
      >
        <span className={`truncate ${value.length ? '' : 'text-muted-foreground'}`}>{resumen}</span>
        <ChevronDown
          className={`size-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full sm:w-64 bg-card border border-border rounded-md shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto divide-y divide-border">
            {opciones.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className="cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors"
              >
                <span
                  className={`size-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    value.includes(c)
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border bg-background'
                  }`}
                >
                  {value.includes(c) && <Check className="size-3" strokeWidth={2.5} />}
                </span>
                <span className="truncate">{c}</span>
              </button>
            ))}
          </div>
          {opciones.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Sin campos cargados.</p>
          )}
          {value.length > 0 && (
            <div className="px-3 py-2 border-t border-border bg-muted/30">
              <button
                type="button"
                onClick={() => onChange([])}
                className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpiar filtro
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Lotes() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterEmpresaId, setFilterEmpresaId] = useState<number | null>(null)
  const [filterCampos, setFilterCampos] = useState<string[]>([])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingLote, setEditingLote] = useState<Lote | null>(null)
  const [formData, setFormData] = useState<LoteFormData>(emptyForm)

  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  const { user, permisos, isSysAdmin, isAsesorAdmin, empresas, currentEmpresaId } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const canWrite = permisos.includes('escritura:lote')
  const canRead = permisos.includes('lectura:lote')
  const userEmpresas = (user?.idEmpresas || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
  const listEmpresas = isAdmin ? empresas : empresas.filter((e) => userEmpresas.includes(e.id))

  // Empresa objetivo del modal (independiente del filtro de la tabla):
  // - admins: la del formData (o la primera disponible)
  // - asesor / productor: la del formData (o la currentEmpresaId)
  const modalEmpresaId = (formData.idEmpresa ?? currentEmpresaId ?? (isAdmin ? empresas[0]?.id || null : null))

  // Usuarios (dueños) según la empresa objetivo
  const {
    data: usuarios = [],
    error: usuariosError,
    isLoading: loadingUsuarios,
  } = useSWR<UsuarioBasico[]>(
    isModalOpen && modalEmpresaId ? `/empresas/${modalEmpresaId}/usuarios` : null,
    usuariosFetcher,
  )

  // Fetcher: sólo el parámetro currentEmpresaId (no hay flag "all" ni "companyIds",
  // ya no hay lotes globales y la API filtra por scope del usuario cuando no
  // se manda empresa).
  const lotesFetcher = async ([url, empresaId]: [string, number | null]) => {
    const params: any = {}
    if (empresaId) params.currentEmpresaId = empresaId
    const res = await api.get(url, { params })
    return res.data
  }

  // Para cualquier usuario, la empresa filtrada es la del selector de la tabla
  // (null = todas / todas sus empresas).
  const effectiveEmpresaId = filterEmpresaId

  const { data: lotes = [], isLoading, mutate } = useSWR<Lote[]>(
    canRead ? ['lotes', effectiveEmpresaId] : null,
    lotesFetcher,
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      dedupingInterval: 0,
    }
  )

  // Cache uid → UsuarioBasico por empresa, para mostrar nombre en la tabla
  const [usuariosPorEmpresa, setUsuariosPorEmpresa] = useState<Map<number, UsuarioBasico[]>>(new Map())
  useEffect(() => {
    if (usuarios.length === 0 || !modalEmpresaId) return
    setUsuariosPorEmpresa((prev) => {
      const next = new Map(prev)
      next.set(modalEmpresaId, usuarios)
      return next
    })
  }, [usuarios, modalEmpresaId])

  const findUsuario = useCallback(
    (uid: string, empresaId: number) => {
      const lista = usuariosPorEmpresa.get(empresaId) || []
      return lista.find((u) => u.uid === uid)
    },
    [usuariosPorEmpresa]
  )

  // Al crear como admin: si no hay idEmpresa seleccionado, usar el primero
  useEffect(() => {
    if (isAdmin && isModalOpen && !editingLote && !formData.idEmpresa && empresas[0]?.id) {
      setFormData((prev) => ({ ...prev, idEmpresa: empresas[0].id }))
    }
  }, [isAdmin, isModalOpen, editingLote, empresas, formData.idEmpresa])

  const campos = useMemo(
    () =>
      Array.from(new Set(lotes.map((l) => l.campo).filter((c) => c && c.trim())))
        .sort((a, b) => a.localeCompare(b, 'es')),
    [lotes]
  )

  const filteredLotes = useMemo(() => {
    return lotes
      ?.filter((l) => {
        if (filterCampos.length > 0 && !filterCampos.includes(l.campo)) return false
        const term = searchTerm.toLowerCase()
        if (!term) return true
        const dueno = findUsuario(l.idUsuario, l.idEmpresa)
        return (
          (l.descripcion?.toLowerCase() || '').includes(term) ||
          (l.campo?.toLowerCase() || '').includes(term) ||
          (dueno?.nombreUsuario?.toLowerCase() || '').includes(term) ||
          (dueno?.email?.toLowerCase() || '').includes(term) ||
          l.idUsuario.toLowerCase().includes(term)
        )
      })
      ?.toSorted((a, b) => {
        if (a.activo !== b.activo) return a.activo ? -1 : 1
        if (a.idEmpresa !== b.idEmpresa) return a.idEmpresa - b.idEmpresa
        return (a.descripcion || '').localeCompare(b.descripcion || '')
      })
  }, [lotes, searchTerm, findUsuario, filterCampos])

  const openCreate = () => {
    setEditingLote(null)
    setFormData({
      ...emptyForm,
      idEmpresa: isAdmin ? (empresas[0]?.id || null) : (currentEmpresaId || null),
    })
    setIsModalOpen(true)
  }

  const openEdit = (lote: Lote) => {
    setEditingLote(lote)
    setFormData({
      descripcion: lote.descripcion || '',
      campo: lote.campo || '',
      idUsuario: lote.idUsuario,
      lat: lote.lat?.toString() ?? '',
      long: lote.long?.toString() ?? '',
      idEmpresa: lote.idEmpresa,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingLote(null)
    setFormData(emptyForm)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const payload: any = {
      descripcion: formData.descripcion || null,
      campo: formData.campo.trim(),
      idUsuario: formData.idUsuario,
      lat: formData.lat === '' ? null : Number(formData.lat),
      long: formData.long === '' ? null : Number(formData.long),
    }
    if (formData.idEmpresa) {
      payload.idEmpresa = formData.idEmpresa
    }
    try {
      if (editingLote) {
        await api.patch(`/lotes/${editingLote.id}`, payload)
      } else {
        await api.post('/lotes', payload)
      }
      closeModal()
      mutate()
    } catch (err) {
      console.error('Error al guardar lote', err)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActivo = async (lote: Lote) => {
    setUpdatingIds((prev) => new Set(prev).add(lote.id))
    try {
      await api.patch(`/lotes/${lote.id}`, { activo: !lote.activo })
      await mutate()
    } catch (err) {
      console.error('Error al cambiar estado del lote', err)
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev)
        next.delete(lote.id)
        return next
      })
    }
  }

  const isEditable = (lote: Lote) => {
    if (!canWrite) return false
    if (isAdmin) return true
    const authorizedEmpresas = (user?.idEmpresas || []).map((e) => Number(e))
    return authorizedEmpresas.includes(lote.idEmpresa)
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

  const filterEmpresaLabel = empresas.find((e) => e.id === filterEmpresaId)?.nombre

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Lotes</h1>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                <Shield className="size-3" strokeWidth={2} />
                Admin
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo de lotes y parcelas por usuario</p>
        </div>

        {canWrite && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nuevo Lote</span>
          </button>
        )}
      </div>

      {/* Filtros: búsqueda + empresa */}
      <div className="bg-card/60 border border-border rounded-lg p-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative group flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Buscar por descripción, dueño o UID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
            />
          </div>
          {(listEmpresas.length > 0 && (isAdmin || userEmpresas.length > 1)) && (
            <select
              aria-label="Filtrar por empresa"
              value={filterEmpresaId ?? 'all'}
              onChange={(e) => setFilterEmpresaId(e.target.value === 'all' ? null : Number(e.target.value))}
              className="sm:w-64 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors cursor-pointer"
            >
              <option value="all">
                {isAdmin
                  ? 'Todas las empresas'
                  : userEmpresas.length > 1
                  ? 'Todas mis empresas'
                  : 'Mi empresa'}
              </option>
              {listEmpresas.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          )}
          {campos.length > 0 && (
            <CampoFiltro
              value={filterCampos}
              opciones={campos}
              onChange={setFilterCampos}
            />
          )}
        </div>
        {filterEmpresaLabel && (
          <p className="text-[11px] text-muted-foreground mt-2 px-1">
            Filtrando por <span className="font-medium text-foreground">{filterEmpresaLabel}</span>
          </p>
        )}
        {filterCampos.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1 px-1">
            Campos: <span className="font-medium text-foreground">{filterCampos.join(', ')}</span>
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando lotes...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {filteredLotes?.map((lote) => {
              const editable = isEditable(lote)
              const dueno = findUsuario(lote.idUsuario, lote.idEmpresa)
              return (
                <div
                  key={lote.id}
                  className={`bg-card border border-border rounded-lg p-4 space-y-3 transition-opacity ${
                    !lote.activo ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-foreground leading-tight">
                          {lote.descripcion || 'Lote sin descripción'}
                        </h3>
                        {!lote.activo && (
                          <span className="px-1.5 py-0.5 bg-destructive-soft text-destructive text-[10px] font-semibold uppercase tracking-wider rounded">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <User className="size-3" strokeWidth={1.75} />
                        <span className="truncate">
                          {dueno?.nombreUsuario || dueno?.email || `UID: ${lote.idUsuario}`}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        {formatCoords(lote.lat, lote.long)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Campo: <span className="text-foreground font-medium">{lote.campo || '—'}</span>
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {editable ? (
                        <>
                          <button
                            onClick={() => openEdit(lote)}
                            className="cursor-pointer p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors"
                            disabled={updatingIds.has(lote.id)}
                            aria-label="Editar"
                          >
                            <Pencil className="size-3.5" strokeWidth={1.75} />
                          </button>
                          <button
                            onClick={() => handleToggleActivo(lote)}
                            className={`cursor-pointer p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                              lote.activo
                                ? 'text-success hover:bg-success-soft'
                                : 'text-muted-foreground hover:bg-muted'
                            }`}
                            title={lote.activo ? 'Desactivar' : 'Activar'}
                            disabled={updatingIds.has(lote.id)}
                            aria-label={lote.activo ? 'Desactivar' : 'Activar'}
                          >
                            {updatingIds.has(lote.id) ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : lote.activo ? (
                              <ToggleRight className="size-4" strokeWidth={1.75} />
                            ) : (
                              <ToggleLeft className="size-4" strokeWidth={1.75} />
                            )}
                          </button>
                        </>
                      ) : (
                        <span
                          className="p-1.5 rounded-md bg-muted text-muted-foreground"
                          title="No tiene permisos para editar este lote"
                        >
                          <Lock className="size-3.5" strokeWidth={1.75} />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="size-3" strokeWidth={1.75} />
                    <span>Empresa: {empresas.find((e) => e.id === lote.idEmpresa)?.nombre || `ID: ${lote.idEmpresa}`}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="hidden sm:block bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Descripción
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Campo
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Dueño
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Coordenadas
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Empresa
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
                  {filteredLotes?.map((lote) => {
                    const editable = isEditable(lote)
                    const dueno = findUsuario(lote.idUsuario, lote.idEmpresa)
                    return (
                      <tr
                        key={lote.id}
                        className={`transition-colors ${lote.activo ? 'hover:bg-muted/40' : 'bg-muted/20 opacity-60'}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`font-medium ${lote.activo ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {lote.descripcion || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                            {lote.campo || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm text-foreground truncate">
                              {dueno?.nombreUsuario || dueno?.email || lote.idUsuario}
                            </span>
                            {dueno?.email && (
                              <span className="text-xs text-muted-foreground truncate">{dueno.email}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground font-mono">
                            {formatCoords(lote.lat, lote.long)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-soft text-warning-foreground text-[10px] font-semibold uppercase tracking-wider rounded">
                            <MapPin className="size-3" strokeWidth={2} />
                            {empresas.find((e) => e.id === lote.idEmpresa)?.nombre || `ID: ${lote.idEmpresa}`}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
                              lote.activo
                                ? 'bg-success-soft text-success'
                                : 'bg-destructive-soft text-destructive'
                            }`}
                          >
                            {lote.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex justify-end gap-1">
                            {editable ? (
                              <>
                                <button
                                  onClick={() => openEdit(lote)}
                                  className="cursor-pointer p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors"
                                  title="Editar"
                                  aria-label="Editar"
                                >
                                  <Pencil className="size-3.5" strokeWidth={1.75} />
                                </button>
                                <button
                                  onClick={() => handleToggleActivo(lote)}
                                  className={`cursor-pointer p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                                    lote.activo
                                      ? 'text-success hover:bg-success-soft'
                                      : 'text-muted-foreground hover:bg-muted'
                                  }`}
                                  title={lote.activo ? 'Desactivar' : 'Activar'}
                                  disabled={updatingIds.has(lote.id)}
                                  aria-label={lote.activo ? 'Desactivar' : 'Activar'}
                                >
                                  {updatingIds.has(lote.id) ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : lote.activo ? (
                                    <ToggleRight className="size-4" strokeWidth={1.75} />
                                  ) : (
                                    <ToggleLeft className="size-4" strokeWidth={1.75} />
                                  )}
                                </button>
                              </>
                            ) : (
                              <span
                                className="p-1.5 rounded-md bg-muted text-muted-foreground inline-flex"
                                title="No tiene permisos para editar este lote"
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
            {filteredLotes?.length === 0 && (
              <div className="p-12 text-center">
                <MapPin className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">
                  {searchTerm || filterEmpresaId || filterCampos.length > 0
                    ? 'No se encontraron lotes con esos criterios.'
                    : 'Aún no hay lotes cargados.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={closeModal}
            aria-hidden
          />
          <div className="relative w-full max-w-lg bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">
                {editingLote ? 'Editar Lote' : 'Nuevo Lote'}
              </h2>
              <button
                onClick={closeModal}
                className="cursor-pointer p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <form className="p-5 space-y-4" onSubmit={handleSubmit}>
              {isAdmin && (
                <div className="space-y-1.5">
                  <label htmlFor="lote-empresa" className="text-xs font-medium text-foreground">
                    Empresa destino
                  </label>
                  <select
                    id="lote-empresa"
                    value={formData.idEmpresa ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        idEmpresa: e.target.value === '' ? null : parseInt(e.target.value, 10),
                        idUsuario: '',
                      })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors cursor-pointer"
                    disabled={!!editingLote}
                  >
                    {editingLote && formData.idEmpresa && (
                      <option value={formData.idEmpresa}>
                        {empresas.find((e) => e.id === formData.idEmpresa)?.nombre || 'Empresa'} (no editable)
                      </option>
                    )}
                    {!editingLote && empresas.length === 0 && <option value="">Sin empresas</option>}
                    {!editingLote &&
                      empresas.map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
                      ))}
                  </select>
                </div>
              )}

              {!isAdmin && !editingLote && userEmpresas.length > 1 && (
                <div className="space-y-1.5">
                  <label htmlFor="lote-empresa-nuevo" className="text-xs font-medium text-foreground">
                    Empresa destino
                  </label>
                  <select
                    id="lote-empresa-nue"
                    value={formData.idEmpresa ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        idEmpresa: e.target.value === '' ? null : parseInt(e.target.value, 10),
                        idUsuario: '',
                      })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors cursor-pointer"
                    required
                  >
                    <option value="">Seleccionar empresa</option>
                    {listEmpresas.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="lote-dueno" className="text-xs font-medium text-foreground">
                  Dueño del lote
                </label>
                <select
                  id="lote-dueno"
                  value={formData.idUsuario}
                  onChange={(e) => setFormData({ ...formData, idUsuario: e.target.value })}
                  required
                  disabled={loadingUsuarios || !!usuariosError}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors cursor-pointer disabled:opacity-60"
                >
                  <option value="" disabled>
                    {loadingUsuarios
                      ? 'Cargando usuarios…'
                      : usuariosError
                      ? 'No se pudieron cargar los usuarios'
                      : 'Seleccionar usuario'}
                  </option>
                  {usuarios.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.nombreUsuario || u.email || u.uid}
                      {u.roles.includes('asesor') ? ' (asesor)' : ''}
                      {u.roles.includes('productor') ? ' (productor)' : ''}
                    </option>
                  ))}
                </select>

                {usuariosError ? (
                  <p className="text-[11px] text-destructive">
                    Error al cargar usuarios: {usuariosError.message || 'sin acceso o sin permisos'}. Verificá que el usuario autenticado tenga la empresa en su <code>idEmpresas</code> y que la asignación de usuarios a empresas esté completa en Firestore.
                  </p>
                ) : !loadingUsuarios && usuarios.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    No hay usuarios con rol <em>asesor</em> o <em>productor</em> asignados a esta empresa. La asignación se gestiona desde el sistema de identidad (Firestore).
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="lote-campo" className="text-xs font-medium text-foreground">
                  Campo <span className="text-destructive">*</span>
                </label>
                <input
                  id="lote-campo"
                  type="text"
                  value={formData.campo}
                  onChange={(e) => setFormData({ ...formData, campo: e.target.value })}
                  placeholder="Ej: El Este, Jácurame, Lote 5"
                  required
                  maxLength={200}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="lote-descripcion" className="text-xs font-medium text-foreground">
                  Descripción
                </label>
                <textarea
                  id="lote-descripcion"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  placeholder="Ej: Lote norte, 50 ha, con frente a la ruta"
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="lote-lat" className="text-xs font-medium text-foreground">
                    Latitud
                  </label>
                  <input
                    id="lote-lat"
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    value={formData.lat}
                    onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                    placeholder="-34.6037"
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="lote-long" className="text-xs font-medium text-foreground">
                    Longitud
                  </label>
                  <input
                    id="lote-long"
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    value={formData.long}
                    onChange={(e) => setFormData({ ...formData, long: e.target.value })}
                    placeholder="-58.3816"
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2"
                  disabled={!formData.idUsuario || !formData.campo.trim() || saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {editingLote ? 'Guardando…' : 'Creando…'}
                    </>
                  ) : (
                    editingLote ? 'Guardar cambios' : 'Crear Lote'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
