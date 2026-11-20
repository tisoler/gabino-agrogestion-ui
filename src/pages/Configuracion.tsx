import { useState } from 'react'
import useSWR from 'swr'
import { AlertCircle, Loader2, RefreshCcw, CheckCircle2, Trash2, Plus, Pencil, ToggleLeft, ToggleRight, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'

interface Aseguradora {
  id: number
  nombre: string
  activo: boolean
}

export default function Configuracion() {
  const { isSysAdmin } = useAuth()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'ok' | 'error' | null>(null)
  const [mensaje, setMensaje] = useState('')

  const [meses, setMeses] = useState(3)
  const [limpiando, setLimpiando] = useState(false)
  const [resultPdfs, setResultPdfs] = useState<'ok' | 'error' | null>(null)
  const [mensajePdfs, setMensajePdfs] = useState('')

  const handleInvalidar = async () => {
    if (busy) return
    setBusy(true)
    setResult(null)
    try {
      await api.post('/cache/invalidate')
      setResult('ok')
      setMensaje('Caché limpiada correctamente.')
    } catch {
      setResult('error')
      setMensaje('No se pudo limpiar la caché. Intentá de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const handleLimpiarPdfs = async () => {
    if (limpiando) return
    if (!window.confirm(`¿Eliminar los PDFs generados hace ${meses} meses o más? Esta acción no se puede deshacer.`)) return
    setLimpiando(true)
    setResultPdfs(null)
    try {
      const { data } = await api.post('/prescripciones/limpiar-pdfs', { meses })
      setResultPdfs('ok')
      setMensajePdfs(data?.eliminados
        ? `Se eliminaron ${data.eliminados} archivo(s).`
        : 'No hay archivos para eliminar.')
    } catch {
      setResultPdfs('error')
      setMensajePdfs('No se pudieron eliminar los archivos. Intentá de nuevo.')
    } finally {
      setLimpiando(false)
    }
  }

  if (!isSysAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Ajustes generales de la aplicación</p>
      </div>

      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Caché</h2>
        <p className="text-sm text-muted-foreground">
          Los datos de usuarios, roles y permisos se cachean por horas para reducir las lecturas a Firestore.
          Si cambiás roles, permisos o asociaciones de usuarios, limpiá la caché para reflejarlo de inmediato.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleInvalidar}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" strokeWidth={1.75} />}
            {busy ? 'Limpiando…' : 'Limpiar caché'}
          </button>
          {result === 'ok' && (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <CheckCircle2 className="size-4" strokeWidth={2} />
              {mensaje}
            </span>
          )}
          {result === 'error' && (
            <span className="inline-flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="size-4" strokeWidth={2} />
              {mensaje}
            </span>
          )}
        </div>
      </section>

      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Archivos PDF</h2>
        <p className="text-sm text-muted-foreground">
          Los PDFs de prescripciones compartidos por WhatsApp se guardan en DigitalOcean Spaces.
          Podés eliminar los más antiguos para liberar espacio. Al eliminarlos, se borra el link y
          el PDF se regenera la próxima vez que se comparta.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted-foreground" htmlFor="mesesPdf">
            Antigüedad mínima
          </label>
          <select
            id="mesesPdf"
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="px-3 py-2 rounded-md border border-border bg-input-background text-sm outline-none focus:border-primary cursor-pointer"
          >
            <option value={1}>1 mes</option>
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
          <button
            onClick={handleLimpiarPdfs}
            disabled={limpiando}
            className="inline-flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {limpiando ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" strokeWidth={1.75} />}
            {limpiando ? 'Eliminando…' : 'Limpiar archivos PDF'}
          </button>
          {resultPdfs === 'ok' && (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <CheckCircle2 className="size-4" strokeWidth={2} />
              {mensajePdfs}
            </span>
          )}
          {resultPdfs === 'error' && (
            <span className="inline-flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="size-4" strokeWidth={2} />
              {mensajePdfs}
            </span>
          )}
        </div>
      </section>

      <EmpresasSegurosSection />
    </div>
  )
}

function EmpresasSegurosSection() {
  const { data: aseguradoras = [], isLoading, mutate } = useSWR<Aseguradora[]>(
    '/aseguradoras',
    fetcher,
    { revalidateOnFocus: false },
  )
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const errorDe = (e: unknown, fallback: string): string => {
    const err = e as { response?: { data?: { message?: string | string[] } } }
    const msg = err?.response?.data?.message
    return Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : fallback
  }

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoNombre.trim() || creando) return
    setCreando(true)
    setError(null)
    try {
      await api.post('/aseguradoras', { nombre: nuevoNombre.trim() })
      setNuevoNombre('')
      mutate()
    } catch (err) {
      setError(errorDe(err, 'No se pudo crear la empresa de seguros.'))
    } finally {
      setCreando(false)
    }
  }

  const handleGuardarNombre = async (id: number) => {
    if (!editNombre.trim() || guardando) return
    setGuardando(true)
    setError(null)
    try {
      await api.patch(`/aseguradoras/${id}`, { nombre: editNombre.trim() })
      setEditandoId(null)
      mutate()
    } catch (err) {
      setError(errorDe(err, 'No se pudo guardar el nombre.'))
    } finally {
      setGuardando(false)
    }
  }

  const handleToggle = async (a: Aseguradora) => {
    setUpdatingIds((prev) => new Set(prev).add(a.id))
    setError(null)
    try {
      await api.patch(`/aseguradoras/${a.id}`, { activo: !a.activo })
      mutate()
    } catch (err) {
      setError(errorDe(err, 'No se pudo cambiar el estado.'))
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev)
        next.delete(a.id)
        return next
      })
    }
  }

  return (
    <section className="bg-card border border-border rounded-lg p-5 space-y-4">
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Empresas de seguros</h2>
      <p className="text-sm text-muted-foreground">
        Catálogo para la planilla de seguros de las producciones. Las inactivas no aparecen como opción,
        pero se conservan en las producciones ya generadas.
      </p>

      <form onSubmit={handleCrear} className="flex gap-2">
        <input
          type="text"
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          placeholder="Nueva empresa (ej: La Dulce)"
          className="flex-1 min-w-0 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
        />
        <button
          type="submit"
          disabled={!nuevoNombre.trim() || creando}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          {creando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={2} />}
          Agregar
        </button>
      </form>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando…
        </div>
      ) : aseguradoras.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay empresas cargadas.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md overflow-hidden">
          {aseguradoras.map((a) => (
            <li key={a.id} className={`flex items-center gap-2 px-3 py-2 ${a.activo ? '' : 'bg-muted/20 opacity-70'}`}>
              {editandoId === a.id ? (
                <>
                  <input
                    type="text"
                    autoFocus
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleGuardarNombre(a.id)
                      if (e.key === 'Escape') setEditandoId(null)
                    }}
                    className="flex-1 min-w-0 px-3 py-1.5 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleGuardarNombre(a.id)}
                    disabled={guardando || !editNombre.trim()}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoId(null)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors cursor-pointer shrink-0"
                    aria-label="Cancelar"
                  >
                    <X className="size-4" strokeWidth={1.75} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{a.nombre}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded shrink-0 ${a.activo
                      ? 'bg-success-soft text-success'
                      : 'bg-destructive-soft text-destructive'
                      }`}
                  >
                    {a.activo ? 'Activa' : 'Inactiva'}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setEditNombre(a.nombre); setEditandoId(a.id); setError(null) }}
                    className="p-1.5 rounded-md text-primary hover:bg-primary-soft transition-colors cursor-pointer shrink-0"
                    title="Editar nombre"
                    aria-label="Editar nombre"
                  >
                    <Pencil className="size-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(a)}
                    className={`p-1.5 rounded-md cursor-pointer transition-colors shrink-0 ${a.activo
                      ? 'text-success hover:bg-success-soft'
                      : 'text-muted-foreground hover:bg-muted'
                      }`}
                    title={a.activo ? 'Desactivar' : 'Activar'}
                    aria-label={a.activo ? 'Desactivar' : 'Activar'}
                  >
                    {updatingIds.has(a.id) ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : a.activo ? (
                      <ToggleRight className="size-4" strokeWidth={1.75} />
                    ) : (
                      <ToggleLeft className="size-4" strokeWidth={1.75} />
                    )}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-xs text-destructive inline-flex items-center gap-1.5 bg-destructive-soft border border-destructive/20 rounded-md px-3 py-2">
          <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
          {error}
        </p>
      )}
    </section>
  )
}
