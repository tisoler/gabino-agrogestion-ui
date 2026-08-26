import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { X, Loader2, AlertCircle, Check, Pencil } from 'lucide-react'
import api from '../lib/api'
import { waLink } from '../lib/mensajes-masivos'
import WhatsAppIcon from './WhatsAppIcon'

interface UsuarioConCelular {
  uid: string
  email: string | null
  nombreUsuario: string | null
  celular: string | null
  roles: string[]
}

interface CompartirPrescripcionModalProps {
  prescripcionId: number
  empresaId: number
  onClose: () => void
}

const fetcher = (url: string) => api.get(url).then((r) => r.data)

const getInitials = (nombre?: string | null) =>
  (nombre || '?')
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')

export default function CompartirPrescripcionModal({
  prescripcionId,
  empresaId,
  onClose,
}: CompartirPrescripcionModalProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modo, setModo] = useState<'seleccion' | 'edicion'>('seleccion')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingUids, setSavingUids] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const initedRef = useRef(false)

  const { data: usuarios = [], isLoading: loadingUsuarios, mutate } = useSWR<UsuarioConCelular[]>(
    `/empresas/${empresaId}/usuarios`,
    fetcher,
    { revalidateOnFocus: false },
  )

  // Genera (o reutiliza) el PDF y devuelve su URL pública.
  useEffect(() => {
    let cancelled = false
    api
      .post(`/prescripciones/${prescripcionId}/compartir`)
      .then((r) => {
        if (!cancelled) setUrl((r.data as { url?: string }).url ?? null)
      })
      .catch((e) => {
        if (cancelled) return
        const err = e as { response?: { data?: { message?: string | string[] } } }
        const msg = err?.response?.data?.message
        setUrlError(
          Array.isArray(msg) ? msg.join(', ')
            : typeof msg === 'string' ? msg
              : 'No se pudo generar el PDF para compartir.',
        )
      })
    return () => { cancelled = true }
  }, [prescripcionId])

  const conCelular = usuarios.filter((u) => u.celular)

  // Inicializa la selección (todos los que tienen celular) y los drafts.
  // Si nadie tiene celular, arranca directo en modo edición.
  useEffect(() => {
    if (initedRef.current || usuarios.length === 0) return
    initedRef.current = true
    setDrafts(Object.fromEntries(usuarios.map((u) => [u.uid, u.celular ?? ''])))
    setSelected(new Set(usuarios.filter((u) => u.celular).map((u) => u.uid)))
    if (usuarios.every((u) => !u.celular)) setModo('edicion')
  }, [usuarios])

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  const texto = `Prescripción N° ${prescripcionId}\n${url ?? ''}`

  // Un link de WhatsApp Web por celular seleccionado, un tab cada uno.
  // Se abren de forma síncrona dentro del gesto para que no las bloquee el
  // navegador.
  const compartir = () => {
    const destino = usuarios.filter((u) => u.celular && selected.has(u.uid))
    for (const u of destino) {
      window.open(waLink(u.celular!, texto), '_blank', 'noopener,noreferrer')
    }
    onClose()
  }

  const guardarCelular = async (uid: string) => {
    setSavingUids((prev) => new Set(prev).add(uid))
    setError(null)
    try {
      const valor = (drafts[uid] ?? '').trim()
      await api.patch(`/usuarios/${uid}/celular`, { celular: valor })
      setDrafts((prev) => ({ ...prev, [uid]: valor }))
      setSelected((prev) => (valor ? new Set(prev).add(uid) : prev))
      await mutate(
        usuarios.map((u) => (u.uid === uid ? { ...u, celular: valor || null } : u)),
        false,
      )
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      const msg = err?.response?.data?.message
      setError(
        Array.isArray(msg) ? msg.join(', ')
          : typeof msg === 'string' ? msg
            : 'No se pudo guardar el celular.',
      )
    } finally {
      setSavingUids((prev) => {
        const next = new Set(prev)
        next.delete(uid)
        return next
      })
    }
  }

  const enModoSeleccion = modo === 'seleccion'
  const seleccionadosConCelular = usuarios.filter((u) => u.celular && selected.has(u.uid))

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg max-h-[85vh] bg-card border border-border rounded-lg shadow-xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border flex justify-between items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex size-9 rounded-md bg-[#25D366]/15 items-center justify-center text-[#25D366] shrink-0">
              <WhatsAppIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">Compartir por WhatsApp</h2>
              <p className="text-xs text-muted-foreground truncate">Prescripción N° {prescripcionId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {urlError && (
            <p className="text-sm text-destructive inline-flex items-center gap-2 bg-destructive-soft border border-destructive/20 rounded-md px-3 py-2">
              <AlertCircle className="size-4 shrink-0" strokeWidth={1.75} />
              {urlError}
            </p>
          )}

          {loadingUsuarios || (!url && !urlError) ? (
            <div className="flex flex-col items-center justify-center py-14">
              <Loader2 className="size-6 text-primary mb-3 animate-spin" strokeWidth={1.75} />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando...</p>
            </div>
          ) : usuarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="size-8 text-muted-foreground/40 mb-3" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">Este productor no tiene usuarios asociados.</p>
            </div>
          ) : enModoSeleccion ? (
            <>
              <p className="text-[11px] text-muted-foreground px-0.5">
                Elegí a quiénes enviarles el PDF. Los usuarios con celular vienen seleccionados; podés desmarcarlos.
              </p>
              <ul className="divide-y divide-border border border-border rounded-md overflow-hidden">
                {usuarios.map((u) => {
                  const tiene = !!u.celular
                  const marcado = selected.has(u.uid)
                  return (
                    <li key={u.uid} className="flex items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={tiene && marcado}
                        disabled={!tiene}
                        onChange={() => toggle(u.uid)}
                        className="size-4 accent-primary cursor-pointer disabled:cursor-not-allowed shrink-0"
                        aria-label={`Compartir con ${u.nombreUsuario || u.email || u.uid}`}
                      />
                      <div className="size-8 rounded-md bg-primary-soft text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                        {getInitials(u.nombreUsuario)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{u.nombreUsuario || u.email || u.uid}</p>
                        {u.email && (
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        )}
                      </div>
                      {tiene ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success-soft text-success text-[10px] font-semibold uppercase tracking-wider rounded shrink-0">
                          <Check className="size-3" strokeWidth={2} />
                          {u.celular}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted text-muted-foreground text-[10px] font-semibold uppercase tracking-wider rounded shrink-0">
                          Sin celular
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground px-0.5">
                Cargá el celular (WhatsApp) para poder enviar el PDF. Formato internacional, ej: +5491122334455.
              </p>
              <ul className="divide-y divide-border border border-border rounded-md overflow-hidden">
                {usuarios.map((u) => (
                  <li key={u.uid} className="px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-md bg-primary-soft text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                        {getInitials(u.nombreUsuario)}
                      </div>
                      <p className="text-sm font-medium text-foreground truncate flex-1">{u.nombreUsuario || u.email || u.uid}</p>
                      {u.celular && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success-soft text-success text-[10px] font-semibold uppercase tracking-wider rounded shrink-0">
                          <Check className="size-3" strokeWidth={2} />
                          {u.celular}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="tel"
                        value={drafts[u.uid] ?? ''}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [u.uid]: e.target.value }))}
                        placeholder="+549..."
                        className="flex-1 min-w-0 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => guardarCelular(u.uid)}
                        disabled={savingUids.has(u.uid)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition-opacity cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {savingUids.has(u.uid) ? (
                          <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                        ) : (
                          <Check className="size-3.5" strokeWidth={2} />
                        )}
                        Guardar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {error && (
            <p className="text-xs text-destructive inline-flex items-center gap-1.5 bg-destructive-soft border border-destructive/20 rounded-md px-3 py-2">
              <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border bg-muted/30 flex items-center gap-2 shrink-0">
          {enModoSeleccion ? (
            <>
              <button
                type="button"
                onClick={() => setModo('edicion')}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                title="Editar celulares de los usuarios"
              >
                <Pencil className="size-3.5" strokeWidth={1.75} />
                Editar celulares
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={compartir}
                disabled={seleccionadosConCelular.length === 0 || !url}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-4 text-xs font-medium text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <WhatsAppIcon className="size-3.5" />
                Compartir ({seleccionadosConCelular.length})
              </button>
            </>
          ) : (
            <>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setModo('seleccion')}
                disabled={conCelular.length === 0}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-4 text-xs font-medium text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <WhatsAppIcon className="size-3.5" />
                Continuar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}