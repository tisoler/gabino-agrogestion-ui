import { useState } from 'react'
import useSWR from 'swr'
import { X, AlertCircle, Loader2, FolderPlus } from 'lucide-react'
import api from '../lib/api'
import { UNIDADES_PRECIO } from '../constantes'
import SelectAutocomplete from './SelectAutocomplete'

interface Categoria {
  id: number
  nombre: string
  activo: boolean
}

interface NuevoInsumoModalProps {
  /** Productor (empresa) de la producción/prescripción en curso. */
  empresaId: number | null
  empresaNombre?: string
  isAdmin: boolean
  /** Recibe el insumo creado (respuesta del POST). */
  onCreated: (insumo: {
    id: number
    nombre: string
    idEmpresa?: number | null
    precioUnitario?: number | null
  }) => void
  onClose: () => void
}

const fetcher = (url: string) => api.get(url).then((r) => r.data)

const inputCls =
  'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'
const labelCls = 'text-xs font-medium text-foreground'

/**
 * Modal compartido de "Nuevo insumo" (Producción y Prescripción nueva).
 * Incluye categoría (con alta si no existe, sólo admins), unidad, precio de
 * referencia y el productor destino (Global o el de la producción; para
 * productor/asesor queda fijado y deshabilitado).
 */
export default function NuevoInsumoModal({
  empresaId,
  empresaNombre,
  isAdmin,
  onCreated,
  onClose,
}: NuevoInsumoModalProps) {
  const { data: categorias = [], mutate: mutateCategorias } = useSWR<Categoria[]>(
    '/categorias',
    fetcher
  )

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [idCategoria, setIdCategoria] = useState<number | ''>('')
  const [unidad, setUnidad] = useState('')
  const [precioUnitario, setPrecioUnitario] = useState('')
  // Para admins: null = Global (default); para el resto se envía empresaId.
  const [idEmpresa, setIdEmpresa] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showCategoriaCreate, setShowCategoriaCreate] = useState(false)
  const [categoriaNombre, setCategoriaNombre] = useState('')
  const [categoriaBusy, setCategoriaBusy] = useState(false)
  const [categoriaError, setCategoriaError] = useState<string | null>(null)

  const handleCreateCategoria = async () => {
    if (!categoriaNombre.trim() || categoriaBusy) return
    setCategoriaBusy(true)
    setCategoriaError(null)
    try {
      const { data } = await api.post('/categorias', { nombre: categoriaNombre.trim() })
      setIdCategoria(data.id)
      setCategoriaNombre('')
      setShowCategoriaCreate(false)
      await mutateCategorias()
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } }; message?: string }
      const msg = err?.response?.data?.message
      const detalle = Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : ''
      setCategoriaError(detalle || err?.message || 'No se pudo crear la categoría.')
    } finally {
      setCategoriaBusy(false)
    }
  }

  const handleSubmit = async () => {
    if (!nombre.trim() || idCategoria === '' || busy) return
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        nombre: nombre.trim(),
        idCategoria: Number(idCategoria),
      }
      if (descripcion.trim() !== '') payload.descripcion = descripcion.trim()
      if (unidad.trim() !== '') payload.unidad = unidad.trim()
      if (precioUnitario.trim() !== '') payload.precioUnitario = parseFloat(precioUnitario)
      payload.idEmpresa = isAdmin ? idEmpresa : empresaId
      const { data } = await api.post('/insumos', payload)
      onCreated(data)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } }; message?: string }
      const msg = err?.response?.data?.message
      const detalle = Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : ''
      setError(detalle || err?.message || 'No se pudo crear el insumo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex justify-between items-center">
          <h2 className="text-base font-semibold text-foreground">Nuevo insumo</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent cursor-pointer" aria-label="Cerrar">
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Nombre</label>
            <input
              type="text"
              autoFocus
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); setError(null) }}
              placeholder="Ej: Glifosato 48%"
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Productor</label>
            <SelectAutocomplete
              value={idEmpresa ?? ''}
              onChange={(v) => { setIdEmpresa(v === '' ? null : Number(v)); setError(null) }}
              disabled={!isAdmin}
              options={[
                ...(isAdmin ? [{ value: '' as const, label: 'Global (todas las empresas)' }] : []),
                ...(empresaId != null ? [{ value: empresaId, label: empresaNombre || 'Productor' }] : []),
              ]}
              placeholder="Seleccionar productor..."
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Categoría</label>
            {!showCategoriaCreate ? (
              <div className="flex gap-2 items-center">
                <SelectAutocomplete
                  className="flex-1 min-w-0"
                  value={idCategoria}
                  onChange={(v) => { setIdCategoria(v === '' ? '' : Number(v)); setError(null) }}
                  options={categorias.filter((c) => c.activo !== false).map((c) => ({ value: c.id, label: c.nombre }))}
                  placeholder="Seleccionar categoría..."
                />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => { setCategoriaError(null); setShowCategoriaCreate(true) }}
                    className="inline-flex items-center gap-1 px-3 py-2 border border-border rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
                    title="Crear nueva categoría"
                    aria-label="Crear nueva categoría"
                  >
                    <FolderPlus className="size-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  autoFocus
                  value={categoriaNombre}
                  onChange={(e) => { setCategoriaNombre(e.target.value); setCategoriaError(null) }}
                  placeholder="Nombre de la categoría"
                  className={inputCls}
                />
                {categoriaError && (
                  <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                    <AlertCircle className="size-3" strokeWidth={1.75} />
                    {categoriaError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowCategoriaCreate(false); setCategoriaError(null) }}
                    className="flex-1 px-3 py-1.5 border border-border rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateCategoria}
                    disabled={!categoriaNombre.trim() || categoriaBusy}
                    className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {categoriaBusy && <Loader2 className="size-3 animate-spin" />}
                    Crear categoría
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Unidad</label>
            <SelectAutocomplete
              value={unidad}
              onChange={(v) => setUnidad(String(v))}
              options={[
                { value: '', label: 'Sin unidad' },
                ...UNIDADES_PRECIO.map((u) => ({ value: u, label: u })),
              ]}
              placeholder="Sin unidad"
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Descripción</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalles adicionales..."
              rows={2}
              className={inputCls + ' resize-none'}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Precio referencia (en dólares USD)</label>
            <input
              type="number" min="0" step="0.01"
              value={precioUnitario}
              onChange={(e) => setPrecioUnitario(e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
          </div>

          {error && (
            <p className="text-[11px] text-destructive inline-flex items-center gap-1">
              <AlertCircle className="size-3" strokeWidth={1.75} />
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!nombre.trim() || idCategoria === '' || busy}
              onClick={handleSubmit}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? 'Creando…' : 'Crear insumo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
