import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Pencil, AlertCircle, Shield,
  Loader2, X,
} from 'lucide-react'
import api, { esErrorDeAcceso } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { useVolver } from '../lib/navegacion'
import MapaLote from '../components/MapaLote'
import SelectAutocomplete from '../components/SelectAutocomplete'
import AnalisisSueloSection from '../components/AnalisisSueloSection'

interface UsuarioBasico {
  uid: string
  email: string | null
  nombreUsuario: string | null
  photoURL: string | null
  roles: string[]
  idEmpresas: number[]
}

interface Campo {
  id: number
  nombre: string
  idEmpresa: number | null
  activo: boolean
}

interface Lote {
  id: number
  descripcion: string | null
  idCampo: number | null
  campo?: Campo | null
  idUsuario: string
  nombreUsuario: string | null
  emailUsuario: string | null
  idEmpresa: number
  geometria?: GeoJSON.GeoJsonObject | null
  centroide?: { lat: number; lng: number } | null
  area?: number | null
  activo: boolean
  createdAt?: string
  updatedAt?: string
}

interface LoteFormData {
  descripcion: string
  idCampo: number | null
  idUsuario: string
  geometria: GeoJSON.GeoJsonObject | null
  centroide: { lat: number; lng: number } | null
  area: string
  idEmpresa: number | null
}

const emptyForm: LoteFormData = {
  descripcion: '',
  idCampo: null,
  idUsuario: '',
  geometria: null,
  centroide: null,
  area: '',
  idEmpresa: null,
}

const toForm = (l: Lote): LoteFormData => ({
  descripcion: l.descripcion || '',
  idCampo: l.idCampo,
  idUsuario: l.idUsuario,
  geometria: l.geometria ?? null,
  centroide: l.centroide ?? null,
  area: l.area?.toString() ?? '',
  idEmpresa: l.idEmpresa,
})

const fetcher = (url: string) => api.get(url).then((r) => r.data)

export default function LoteDetalle() {
  const { id } = useParams<{ id?: string }>()
  const isNew = id === undefined
  const loteId = isNew ? null : Number(id)
  const volver = useVolver('/lotes')
  const navigate = useNavigate()

  const { user, permisos, isSysAdmin, empresas, currentEmpresaId } = useAuth()
  const isAdmin = isSysAdmin
  const canWrite = permisos.includes('escritura:lote')
  const canRead = permisos.includes('lectura:lote')
  const userEmpresas = (user?.idEmpresas || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)

  const {
    data: lote,
    error,
    isLoading,
    mutate,
  } = useSWR<Lote>(!isNew && canRead && loteId ? `/lotes/${loteId}` : null, fetcher, {
    revalidateOnFocus: false,
  })

  // Formulario sincronizado con el lote cargado (ajuste durante el render:
  // sólo se re-inicializa cuando cambia la identidad del lote).
  const loteKey = isNew ? 'nuevo' : lote ? `lote-${lote.id}-${lote.updatedAt ?? ''}` : null
  const [formKey, setFormKey] = useState<string | null>(null)
  const [formData, setFormData] = useState<LoteFormData>(emptyForm)
  if (loteKey !== formKey) {
    setFormKey(loteKey)
    setFormData(lote && !isNew ? toForm(lote) : { ...emptyForm })
  }

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  // Modal: crear un campo nuevo desde el formulario
  const [isCampoModalOpen, setIsCampoModalOpen] = useState(false)
  const [campoNombre, setCampoNombre] = useState('')
  const [campoBusy, setCampoBusy] = useState(false)
  const [campoError, setCampoError] = useState<string | null>(null)

  // Empresa objetivo: la del form (edición: fija del lote).
  const empresaId = formData.idEmpresa ?? currentEmpresaId ?? null

  const {
    data: usuarios = [],
    error: usuariosError,
    isLoading: loadingUsuarios,
  } = useSWR<UsuarioBasico[]>(
    empresaId ? `/empresas/${empresaId}/usuarios` : null,
    fetcher,
  )

  const { data: campos = [], mutate: mutateCampos } = useSWR<Campo[]>(
    canRead ? '/campos' : null,
    fetcher,
  )

  // Al crear como admin: si no hay empresa elegida, usar la primera.
  useEffect(() => {
    if (!isNew || formData.idEmpresa || !isAdmin || !empresas[0]?.id) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidrata default desde catálogo async
    setFormData((prev) => (prev.idEmpresa ? prev : { ...prev, idEmpresa: empresas[0].id }))
  }, [isNew, isAdmin, empresas, formData.idEmpresa])

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tienes permisos para ver esta sección.</p>
      </div>
    )
  }

  if (!isNew && error && esErrorDeAcceso(error)) {
    return <Navigate to="/lotes" replace />
  }

  const editable =
    canWrite &&
    (isNew ||
      isAdmin ||
      (lote != null && userEmpresas.includes(lote.idEmpresa)))

  const handleCreateCampo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!campoNombre.trim() || campoBusy) return
    setCampoBusy(true)
    setCampoError(null)
    try {
      const { data } = await api.post('/campos', { nombre: campoNombre.trim(), idEmpresa: empresaId })
      setFormData((prev) => ({ ...prev, idCampo: data.id }))
      setCampoNombre('')
      setIsCampoModalOpen(false)
      await mutateCampos()
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      setCampoError(
        e?.response?.data?.message ||
        e?.message ||
        'No se pudo crear el campo',
      )
    } finally {
      setCampoBusy(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setSaveError(null)
    setSavedOk(false)
    const duenoSel = usuarios.find((u) => u.uid === formData.idUsuario)
    const payload: Record<string, unknown> = {
      descripcion: formData.descripcion || null,
      idCampo: formData.idCampo,
      idUsuario: formData.idUsuario,
      nombreUsuario:
        duenoSel?.nombreUsuario ||
        duenoSel?.email ||
        lote?.nombreUsuario ||
        '',
      emailUsuario: duenoSel?.email || lote?.emailUsuario || '',
      geometria: formData.geometria ?? null,
      centroide: formData.centroide ?? null,
      area: formData.area === '' ? null : Number(formData.area),
    }
    if (formData.idEmpresa) {
      payload.idEmpresa = formData.idEmpresa
    }
    try {
      if (isNew) {
        const { data } = await api.post('/lotes', payload)
        navigate(`/lotes/${data.id}`)
      } else {
        await api.patch(`/lotes/${loteId}`, payload)
        setSavedOk(true)
        await mutate()
      }
    } catch (err) {
      const e = err as { response?: { data?: { message?: string | string[] } }; message?: string }
      const msg = e?.response?.data?.message
      setSaveError(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo guardar el lote.')
    } finally {
      setSaving(false)
    }
  }

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6 justify-center">
        <Loader2 className="size-4 animate-spin" /> Cargando lote…
      </div>
    )
  }

  if (!isNew && !lote && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Lote no encontrado</h2>
      </div>
    )
  }

  const titulo = isNew
    ? 'Nuevo lote'
    : lote?.descripcion || `Lote #${lote?.id ?? ''}`

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-0">
      <div className="flex items-center gap-3">
        <button
          onClick={volver}
          className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
        </button>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">{titulo}</h1>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-soft text-primary text-[10px] font-semibold uppercase tracking-wider rounded">
                <Shield className="size-3" strokeWidth={2} />
                Admin
              </span>
            )}
          </div>
          {!isNew && lote && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {empresas.find((e) => e.id === lote.idEmpresa)?.nombre || `Productor #${lote.idEmpresa}`}
              {lote.campo?.nombre ? ` · ${lote.campo.nombre}` : ''}
            </p>
          )}
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 bg-destructive-soft text-destructive border border-destructive/30 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="size-4 shrink-0" strokeWidth={1.75} />
          <span>{saveError}</span>
        </div>
      )}
      {savedOk && (
        <p className="text-sm text-success">Cambios guardados.</p>
      )}

      <form className="bg-card border border-border rounded-lg p-5 space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isAdmin && (
            <div className="space-y-1.5">
              <label htmlFor="lote-empresa" className="text-xs font-medium text-foreground">
                Productor
              </label>
              {isNew ? (
                <SelectAutocomplete
                  value={formData.idEmpresa ?? ''}
                  onChange={(v) =>
                    setFormData({
                      ...formData,
                      idEmpresa: v === '' ? null : Number(v),
                      idUsuario: '',
                    })
                  }
                  placeholder="Seleccionar productor"
                  options={empresas.map((e) => ({ value: e.id, label: e.nombre }))}
                />
              ) : (
                <p className="px-3 py-2 bg-muted/50 border border-border rounded-md text-sm text-muted-foreground">
                  {empresas.find((e) => e.id === formData.idEmpresa)?.nombre || `Productor #${formData.idEmpresa ?? '—'}`} (no editable)
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="lote-dueno" className="text-xs font-medium text-foreground">
              Dueño del lote
            </label>
            <SelectAutocomplete
              value={formData.idUsuario}
              onChange={(v) => setFormData({ ...formData, idUsuario: String(v) })}
              disabled={loadingUsuarios || !!usuariosError || !editable}
              placeholder={
                loadingUsuarios
                  ? 'Cargando usuarios…'
                  : usuariosError
                    ? 'No se pudieron cargar los usuarios'
                    : 'Seleccionar usuario'
              }
              options={usuarios.map((u) => ({
                value: u.uid,
                label:
                  (u.nombreUsuario || u.email || u.uid) +
                  (u.roles.includes('asesor') ? ' (asesor)' : '') +
                  (u.roles.includes('productor') ? ' (productor)' : ''),
              }))}
            />

            {usuariosError ? (
              <p className="text-[11px] text-destructive">
                Error al cargar usuarios: {usuariosError.message || 'sin acceso o sin permisos'}.
              </p>
            ) : !loadingUsuarios && usuarios.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No hay usuarios con rol <em>asesor</em> o <em>productor</em> asignados a este productor.
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="lote-campo" className="text-xs font-medium text-foreground">
              Campo <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2 items-center">
              <SelectAutocomplete
                value={formData.idCampo ?? ''}
                onChange={(v) =>
                  setFormData({ ...formData, idCampo: v === '' ? null : Number(v) })
                }
                placeholder={
                  campos.filter((c) => c.idEmpresa === empresaId).length === 0
                    ? 'Sin campos para este productor'
                    : 'Seleccionar campo...'
                }
                options={campos
                  .filter((c) => c.idEmpresa === empresaId && (c.activo || c.id === formData.idCampo))
                  .map((c) => ({ value: c.id, label: c.nombre }))}
                className="flex-1 min-w-0"
                disabled={!editable}
              />
              {editable && (
                <button
                  type="button"
                  onClick={() => { setCampoError(null); setCampoNombre(''); setIsCampoModalOpen(true) }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0"
                  title="Crear nuevo campo"
                  aria-label="Crear nuevo campo"
                >
                  <Plus className="size-4" strokeWidth={1.75} />
                  <span className="hidden sm:inline">Nuevo</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lote-descripcion" className="text-xs font-medium text-foreground">
              Nombre del lote
            </label>
            <input
              id="lote-descripcion"
              type="text"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Ej: Lote norte"
              maxLength={500}
              disabled={!editable}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors disabled:opacity-60"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-end justify-between gap-2">
            <label className="text-xs font-medium text-foreground">
              Mapa del lote
            </label>
            <div className="flex items-center gap-1.5">
              <label htmlFor="lote-area" className="text-xs font-medium text-foreground">
                Área (ha)
              </label>
              <input
                id="lote-area"
                type="number"
                step="0.01"
                min="0"
                value={formData.area}
                onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                placeholder="0.00"
                disabled={!editable}
                className="w-28 px-2 py-1.5 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors text-right disabled:opacity-60"
              />
            </div>
          </div>
          <MapaLote
            dibujar={editable}
            altura="h-[26rem]"
            geometria={formData.geometria}
            centroide={formData.centroide}
            onChange={(geometria, centroide, areaHa) => {
              setFormData((prev) => ({
                ...prev,
                geometria,
                centroide,
                area: areaHa > 0 ? String(Number(areaHa.toFixed(2))) : prev.area,
              }))
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Trazá el polígono del lote. Se guardan la geometría y el centroide
            {formData.centroide && (
              <> · centroide: {formData.centroide.lat.toFixed(5)}, {formData.centroide.lng.toFixed(5)}</>
            )}
          </p>
        </div>

        {editable && (
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2"
              disabled={
                !formData.idUsuario ||
                !formData.idCampo ||
                !formData.descripcion.trim() ||
                (isNew && (isAdmin || userEmpresas.length > 1) && !formData.idEmpresa) ||
                saving
              }
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {isNew ? 'Creando…' : 'Guardando…'}
                </>
              ) : (
                isNew ? 'Crear Lote' : 'Guardar cambios'
              )}
            </button>
          </div>
        )}
        {!editable && !isNew && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Pencil className="size-3" strokeWidth={1.75} />
            No tienes permisos para editar este lote.
          </p>
        )}
      </form>

      {!isNew && loteId !== null && (
        <AnalisisSueloSection loteId={loteId} canWrite={editable} />
      )}

      {isCampoModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => { if (!campoBusy) setIsCampoModalOpen(false) }}
            aria-hidden
          />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">Nuevo campo</h2>
              <button
                onClick={() => setIsCampoModalOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <form className="p-5 space-y-4" onSubmit={handleCreateCampo}>
              <div className="space-y-1.5">
                <label htmlFor="campo-nombre" className="text-xs font-medium text-foreground">
                  Nombre del campo
                </label>
                <input
                  id="campo-nombre"
                  type="text"
                  value={campoNombre}
                  onChange={(e) => { setCampoNombre(e.target.value); setCampoError(null) }}
                  placeholder="Ej: Establecimiento principal"
                  maxLength={200}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                />
                {campoError && (
                  <p className="text-[11px] text-destructive">{campoError}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCampoModalOpen(false)}
                  disabled={campoBusy}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!campoNombre.trim() || campoBusy}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  {campoBusy && <Loader2 className="size-4 animate-spin" />}
                  {campoBusy ? 'Creando…' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
