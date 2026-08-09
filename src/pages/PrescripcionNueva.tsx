import { useState, useMemo, useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, AlertCircle, Loader2, Calendar, Building2,
  Pickaxe, Package, FolderPlus, X,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { periodosCampania } from '../lib/campanias'

const fetcher = (url: string) => api.get(url).then((r) => r.data)
const todayLocalISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface CampaniaOption {
  id: number
  nombre: string
  campania: string
  lote?: { id: number; descripcion: string | null; idEmpresa: number } | null
}
interface Lote { id: number; idEmpresa: number; descripcion: string | null }
interface Cultivo { id: number; nombre: string; variedades: { id: number; nombre: string }[] }
interface Labor { id: number; nombre: string }
interface Insumo { id: number; nombre: string; unidad?: string | null }
interface Categoria { id: number; nombre: string }

interface InsumoRow {
  tempId: number
  idInsumo: number | ''
  cantidadPorHa: string
  cantidadTotal: string
  lastEdited: 'porHa' | 'total' | null
}

const num = (s: string): number => {
  const t = s.trim()
  if (t === '') return 0
  const n = Number(t.replace(/,/g, '.'))
  return Number.isFinite(n) ? n : 0
}

/** Normaliza el separador decimal a coma (acepta punto o coma al tipear). */
const fmtInputDecimal = (s: string): string => s.replace(/\./g, ',')

function fmtNumValue(n: number): string {
  if (!Number.isFinite(n) || n === 0) return n === 0 ? '0' : ''
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export default function PrescripcionNueva() {
  const navigate = useNavigate()
  const { mutate } = useSWRConfig()
  const { permisos, isSysAdmin, isAsesorAdmin, user, empresas } = useAuth()
  const isAdmin = isSysAdmin || isAsesorAdmin
  const canWrite = permisos.includes('escritura:prescripcion')

  const empresasVisibles = useMemo(() => {
    if (isAdmin) return empresas
    const ids = (user?.idEmpresas || []).map(Number)
    return empresas.filter((e) => ids.includes(e.id))
  }, [isAdmin, user, empresas])

  // Paso 1: empresa → campañas
  const [fecha, setFecha] = useState(todayLocalISO())
  const [idEmpresa, setIdEmpresa] = useState<number | ''>('')
  const [idCampania, setCampania] = useState<number | ''>('')

  // Catálogos (sys-admin y asesor-admin ven todas las labores/insumos)
  const { data: lotes = [] } = useSWR<Lote[]>(canWrite ? '/lotes' : null, fetcher)
  const { data: cultivos = [] } = useSWR<Cultivo[]>(canWrite ? '/cultivos' : null, fetcher)
  const { data: labores = [] } = useSWR<Labor[]>(canWrite ? ['/labores', 'all'] : null, () =>
    api.get('/labores', { params: { all: true } }).then((r) => r.data))
  const { data: insumos = [], mutate: mutateInsumos } = useSWR<Insumo[]>(canWrite ? ['/insumos', 'all'] : null, () =>
    api.get('/insumos', { params: { all: true } }).then((r) => r.data))
  const { data: categorias = [] } = useSWR<Categoria[]>(canWrite ? '/categorias' : null, fetcher)

  const { data: campanias = [], mutate: mutateCampanias } = useSWR<CampaniaOption[]>(
    canWrite && idEmpresa !== '' ? ['/campanias', idEmpresa] : null,
    async () => {
      const res = await api.get('/campanias', { params: { currentEmpresaId: Number(idEmpresa) } })
      return res.data as CampaniaOption[]
    }
  )

  const lotesEmpresa = useMemo(
    () => (idEmpresa === '' ? [] : lotes.filter((l) => l.idEmpresa === Number(idEmpresa))),
    [lotes, idEmpresa]
  )

  const campaniaSel = useMemo(
    () => (idCampania === '' ? undefined : campanias.find((c) => c.id === Number(idCampania))),
    [campanias, idCampania]
  )

  // Paso 2: labor + total ha
  const [idLabor, setLabor] = useState<number | ''>('')
  const [totalHa, setTotalHa] = useState('')

  // Paso 3: insumos
  const [insumoRows, setInsumoRows] = useState<InsumoRow[]>([])
  const [tempCounter, setTempCounter] = useState<number>(-1)

  // Modales
  const [showCampaniaModal, setShowCampaniaModal] = useState(false)
  const [campaniaForm, setCampaniaForm] = useState({
    nombre: '', campania: periodosCampania()[0] || '',
    idLote: '' as number | '', idCultivo: '' as number | '', idVariedad: '' as number | '',
  })
  const [showInsumoModal, setShowInsumoModal] = useState(false)
  const [insumoForRow, setInsumoForRow] = useState<number | null>(null)
  const [insumoForm, setInsumoForm] = useState({ nombre: '', idCategoria: '' as number | '', precioUnitario: '' })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalHaNum = num(totalHa)
  const canAddInsumos = idCampania !== '' && idLabor !== '' && totalHaNum > 0

  // Insumo temporal: variedades del cultivo seleccionado en el modal campaña
  const variedadesModal = useMemo(() => {
    if (campaniaForm.idCultivo === '') return []
    return cultivos.find((c) => c.id === Number(campaniaForm.idCultivo))?.variedades || []
  }, [cultivos, campaniaForm.idCultivo])

  const addInsumo = () => {
    setInsumoRows((rows) => [
      ...rows,
      { tempId: tempCounter, idInsumo: '', cantidadPorHa: '', cantidadTotal: '', lastEdited: null },
    ])
    setTempCounter((c) => c - 1)
  }

  const removeInsumo = (tempId: number) => setInsumoRows((rows) => rows.filter((r) => r.tempId !== tempId))

  // Edición de cantidad con recálculo del otro campo: total = cant_ha * total_ha
  const updatePorHa = (tempId: number, value: string) => {
    const clean = fmtInputDecimal(value)
    setInsumoRows((rows) =>
      rows.map((r) =>
        r.tempId === tempId
          ? { ...r, cantidadPorHa: clean, lastEdited: 'porHa', cantidadTotal: fmtNumValue(num(clean) * totalHaNum) }
          : r
      )
    )
  }

  const updateTotal = (tempId: number, value: string) => {
    const clean = fmtInputDecimal(value)
    setInsumoRows((rows) =>
      rows.map((r) =>
        r.tempId === tempId
          ? {
            ...r,
            cantidadTotal: clean,
            lastEdited: 'total',
            cantidadPorHa: totalHaNum > 0 ? fmtNumValue(num(clean) / totalHaNum) : r.cantidadPorHa,
          }
          : r
      )
    )
  }

  const recomputeByTotalHa = useCallback((rows: InsumoRow[], newTotalHa: number) => {
    return rows.map((r) => {
      if (r.lastEdited === 'porHa') {
        return { ...r, cantidadTotal: fmtNumValue(num(r.cantidadPorHa) * newTotalHa) }
      }
      if (r.lastEdited === 'total') {
        return { ...r, cantidadPorHa: newTotalHa > 0 ? fmtNumValue(num(r.cantidadTotal) / newTotalHa) : r.cantidadPorHa }
      }
      return r
    })
  }, [])

  const handleTotalHaChange = (value: string) => {
    const clean = fmtInputDecimal(value)
    setTotalHa(clean)
    const n = num(clean)
    setInsumoRows((rows) => recomputeByTotalHa(rows, n))
  }

  // Crear campaña desde el modal
  const handleCreateCampania = async () => {
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        nombre: campaniaForm.nombre.trim(),
        campania: campaniaForm.campania,
        idLote: Number(campaniaForm.idLote),
        idCultivo: Number(campaniaForm.idCultivo),
      }
      if (campaniaForm.idVariedad !== '') payload.idVariedad = Number(campaniaForm.idVariedad)
      const { data } = await api.post('/campanias', payload)
      await mutateCampanias()
      setCampania(data.id)
      setShowCampaniaModal(false)
      setCampaniaForm({
        nombre: '', campania: periodosCampania()[0] || '',
        idLote: '', idCultivo: '', idVariedad: '',
      })
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo crear la campaña.')
    }
  }

  // Crear insumo desde el modal
  const handleCreateInsumo = async () => {
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        nombre: insumoForm.nombre.trim(),
        idCategoria: Number(insumoForm.idCategoria),
      }
      if (insumoForm.precioUnitario.trim() !== '') payload.precioUnitario = parseFloat(insumoForm.precioUnitario)
      const { data } = await api.post('/insumos', payload)
      await mutateInsumos()
      if (insumoForRow != null) {
        setInsumoRows((rows) => rows.map((r) => (r.tempId === insumoForRow ? { ...r, idInsumo: data.id } : r)))
      }
      setShowInsumoModal(false)
      setInsumoForm({ nombre: '', idCategoria: '', precioUnitario: '' })
      setInsumoForRow(null)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo crear el insumo.')
    }
  }

  const canSave =
    fecha !== '' && idCampania !== '' && idLabor !== '' && totalHaNum > 0 &&
    insumoRows.every((r) => r.idInsumo !== '')

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        fecha,
        idCampania: Number(idCampania),
        idLabor: Number(idLabor),
        totalHaAplicacion: totalHaNum,
        insumos: insumoRows
          .filter((r) => r.idInsumo !== '')
          .map((r) => ({
            idInsumo: Number(r.idInsumo),
            cantidadPorHa: num(r.cantidadPorHa),
            cantidadTotal: num(r.cantidadTotal),
          })),
      }
      const { data } = await api.post('/prescripciones', payload)
      // La prescripción asigna labor/insumos a la campaña: invalidá el cache
      // de campañas (detalle y listado) y de prescripciones para que reflejen
      // los datos sin tener que refrescar la app.
      const keyBase = (key: unknown): string =>
        typeof key === 'string' ? key : Array.isArray(key) && typeof key[0] === 'string' ? key[0] : ''
      await mutate(
        (key) => keyBase(key).startsWith('/campanias'),
        undefined,
        { revalidate: true },
      )
      await mutate(
        (key) => keyBase(key).startsWith('/prescripciones'),
        undefined,
        { revalidate: true },
      )
      navigate(`/prescripciones/${data.id}`)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo guardar la prescripción.')
    } finally {
      setSaving(false)
    }
  }

  if (!canWrite) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tienes permisos para crear prescripciones.</p>
      </div>
    )
  }

  const inputCls =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'
  const labelCls = 'text-xs font-medium text-foreground'

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/prescripciones')}
            className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Volver"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Nueva Prescripción</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Receta de aplicación de labor e insumos sobre una campaña</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-destructive-soft text-destructive border border-destructive/30 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="size-4 shrink-0" strokeWidth={1.75} />
          <span>{error}</span>
        </div>
      )}

      {/* Fecha */}
      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-primary" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Datos de la aplicación</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Productor</label>
            <select
              value={idEmpresa}
              onChange={(e) => {
                const v = e.target.value === '' ? '' : Number(e.target.value)
                setIdEmpresa(v)
                setCampania('')
              }}
              className={inputCls}
            >
              <option value="">Seleccionar productor...</option>
              {empresasVisibles.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Campañas */}
        <div className="space-y-1.5">
          <label className={labelCls}>Campaña</label>
          {idEmpresa === '' ? (
            <p className="text-sm text-muted-foreground">Elegí primero el productor.</p>
          ) : (
            <>
              <select
                value={idCampania}
                onChange={(e) => setCampania(e.target.value === '' ? '' : Number(e.target.value))}
                className={inputCls}
              >
                <option value="">Seleccionar campaña...</option>
                {campanias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              {campaniaSel && (
                <p className="text-[12px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                  <span>
                    Lote: <span className="font-medium text-foreground">{campaniaSel.lote?.descripcion || `Lote #${campaniaSel.lote?.id ?? '—'}`}</span>
                  </span>
                  <span>
                    Campaña: <span className="font-medium text-foreground">{campaniaSel.campania}</span>
                  </span>
                </p>
              )}
              {campanias.length === 0 && (
                <p className="text-[12px] text-muted-foreground">
                  Este productor aún no tiene campañas. Creá una para continuar.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowCampaniaModal(true)}
                className="inline-flex items-center gap-1.5 mt-1 text-xs font-medium text-primary hover:underline"
              >
                <FolderPlus className="size-3.5" strokeWidth={1.75} />
                Crear campaña
              </button>
            </>
          )}
        </div>
      </section>

      {/* Labor + total ha */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Pickaxe className="size-4 text-primary" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Labor y superficie</h2>
        </div>
        <div className="bg-card border border-border rounded-lg p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Labor</label>
            <select
              value={idLabor}
              onChange={(e) => setLabor(e.target.value === '' ? '' : Number(e.target.value))}
              className={inputCls}
            >
              <option value="">Seleccionar labor...</option>
              {labores.map((l) => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Total ha para aplicación</label>
            <input
              type="text"
              inputMode="decimal"
              value={totalHa}
              onChange={(e) => handleTotalHaChange(e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* Insumos */}
      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-primary" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Insumos</h2>
          </div>
          <button
            type="button"
            onClick={addInsumo}
            disabled={!canAddInsumos}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Plus className="size-3.5" strokeWidth={2} />
            Agregar insumo
          </button>
        </div>

        {!canAddInsumos ? (
          <p className="text-sm text-muted-foreground">
            Seleccioná la campaña, la labor y el total de hectáreas para habilitar los insumos.
          </p>
        ) : insumoRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay insumos agregados todavía.</p>
        ) : (
          <div className="space-y-3">
            {insumoRows.map((row) => (
              <div key={row.tempId} className="grid grid-cols-1 sm:grid-cols-[minmax(140px,1fr)_80px_120px_120px_auto] gap-2 items-end">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    Insumo
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={row.idInsumo}
                      onChange={(e) =>
                        setInsumoRows((rows) =>
                          rows.map((r) => (r.tempId === row.tempId ? { ...r, idInsumo: e.target.value === '' ? '' : Number(e.target.value) } : r))
                        )
                      }
                      className={inputCls}
                    >
                      <option value="">Elegí…</option>
                      {insumos.map((i) => (
                        <option key={i.id} value={i.id}>{i.nombre}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setInsumoForRow(row.tempId); setShowInsumoModal(true) }}
                      className="px-2.5 border border-border rounded-md text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
                      title="Crear nuevo insumo"
                      aria-label="Crear nuevo insumo"
                    >
                      <Plus className="size-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    Unidad
                  </label>
                  <p className="text-sm text-foreground py-2">
                    {row.idInsumo !== ''
                      ? insumos.find((i) => i.id === Number(row.idInsumo))?.unidad || '—'
                      : '—'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    Cantidad / ha
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.cantidadPorHa}
                    onChange={(e) => updatePorHa(row.tempId, e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    Cantidad total
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.cantidadTotal}
                    onChange={(e) => updateTotal(row.tempId, e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeInsumo(row.tempId)}
                  className="p-2 rounded-md text-destructive hover:bg-destructive-soft self-end"
                  aria-label="Eliminar insumo"
                >
                  <Trash2 className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground px-0.5">
              Total = cantidad/ha × {totalHaNum || 0} ha. Editar un campo recalcula el otro.
            </p>
          </div>
        )}
      </section>

      {/* Acciones */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => navigate('/prescripciones')}
          className="px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? 'Guardando…' : 'Guardar prescripción'}
        </button>
      </div>

      {/* Modal: crear campaña */}
      {showCampaniaModal && idEmpresa !== '' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setShowCampaniaModal(false)} aria-hidden />
          <div className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">
                <Building2 className="size-4 inline mr-2 text-primary" strokeWidth={1.75} />
                Nueva campaña
              </h2>
              <button onClick={() => setShowCampaniaModal(false)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent" aria-label="Cerrar">
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Nombre</label>
                <input
                  type="text"
                  value={campaniaForm.nombre}
                  onChange={(e) => setCampaniaForm({ ...campaniaForm, nombre: e.target.value })}
                  placeholder="Ej: Campaña 2025/2026"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Campaña</label>
                <select
                  value={campaniaForm.campania}
                  onChange={(e) => setCampaniaForm({ ...campaniaForm, campania: e.target.value })}
                  className={inputCls}
                >
                  <option value="" disabled>Seleccionar período...</option>
                  {periodosCampania().map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Lote</label>
                <select
                  value={campaniaForm.idLote}
                  onChange={(e) => setCampaniaForm({ ...campaniaForm, idLote: e.target.value === '' ? '' : Number(e.target.value) })}
                  className={inputCls}
                >
                  <option value="">Seleccionar lote...</option>
                  {lotesEmpresa.map((l) => (
                    <option key={l.id} value={l.id}>{l.descripcion || `Lote #${l.id}`}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Cultivo</label>
                <select
                  value={campaniaForm.idCultivo}
                  onChange={(e) => setCampaniaForm({ ...campaniaForm, idCultivo: e.target.value === '' ? '' : Number(e.target.value), idVariedad: '' })}
                  className={inputCls}
                >
                  <option value="">Seleccionar cultivo...</option>
                  {cultivos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Variedad</label>
                <select
                  value={campaniaForm.idVariedad}
                  onChange={(e) => setCampaniaForm({ ...campaniaForm, idVariedad: e.target.value === '' ? '' : Number(e.target.value) })}
                  disabled={campaniaForm.idCultivo === ''}
                  className={inputCls}
                >
                  <option value="">{campaniaForm.idCultivo === '' ? 'Elegí cultivo' : 'Sin variedad'}</option>
                  {variedadesModal.map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCampaniaModal(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!campaniaForm.nombre.trim() || campaniaForm.idLote === '' || campaniaForm.idCultivo === ''}
                  onClick={handleCreateCampania}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Crear campaña
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: crear insumo */}
      {showInsumoModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => { setShowInsumoModal(false); setInsumoForRow(null) }} aria-hidden />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-foreground">Nuevo insumo</h2>
              <button onClick={() => { setShowInsumoModal(false); setInsumoForRow(null) }} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent" aria-label="Cerrar">
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Nombre</label>
                <input
                  type="text"
                  autoFocus
                  value={insumoForm.nombre}
                  onChange={(e) => setInsumoForm({ ...insumoForm, nombre: e.target.value })}
                  placeholder="Ej: Glifosato 48%"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Categoría</label>
                <select
                  value={insumoForm.idCategoria}
                  onChange={(e) => setInsumoForm({ ...insumoForm, idCategoria: e.target.value === '' ? '' : Number(e.target.value) })}
                  className={inputCls}
                >
                  <option value="">Seleccionar categoría...</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Precio unitario (referencia)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={insumoForm.precioUnitario}
                  onChange={(e) => setInsumoForm({ ...insumoForm, precioUnitario: e.target.value })}
                  placeholder="0.00"
                  className={inputCls}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowInsumoModal(false); setInsumoForRow(null) }}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!insumoForm.nombre.trim() || insumoForm.idCategoria === ''}
                  onClick={handleCreateInsumo}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Crear insumo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}