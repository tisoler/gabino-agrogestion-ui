import { useState } from 'react'
import { AlertCircle, Loader2, RefreshCcw, CheckCircle2 } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'

export default function Configuracion() {
  const { isSysAdmin } = useAuth()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'ok' | 'error' | null>(null)
  const [mensaje, setMensaje] = useState('')

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
    </div>
  )
}
