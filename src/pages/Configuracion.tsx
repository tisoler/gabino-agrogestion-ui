import { useState } from 'react'
import { AlertCircle, Loader2, RefreshCcw, CheckCircle2, Trash2 } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'

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
    </div>
  )
}
