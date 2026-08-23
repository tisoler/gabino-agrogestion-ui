import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, Activity, Loader2, Send, MessagesSquare,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { periodosCampania } from '../lib/campanias'
import { mensajeError } from '../lib/reportes'
import {
  SALUDO_DEFAULT, TOKEN_NOMBRE,
  personalizar, waLink,
  type Destinatario, type MensajeMasivoCreado,
} from '../lib/mensajes-masivos'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

interface Cultivo {
  id: number
  nombre: string
}

export default function MensajeMasivoNuevo() {
  const navigate = useNavigate()
  const { permisos } = useAuth()
  const canWrite = permisos.includes('escritura:mensaje-masivo')

  const [idCultivo, setIdCultivo] = useState<number | ''>('')
  const [periodo, setPeriodo] = useState(() => periodosCampania()[0] || '')
  const [mensaje, setMensaje] = useState(SALUDO_DEFAULT)
  // Todos los destinatarios vienen seleccionados por defecto: en vez de
  // marcar, se registran los que el usuario deselecciona (así no hace falta
  // sincronizar estado con la respuesta de SWR).
  const [excluidos, setExcluidos] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: cultivos = [] } = useSWR<Cultivo[]>(
    canWrite ? '/cultivos' : null,
    fetcher
  )

  const destinatariosFetcher = async ([, cultivo, campania]: [string, string, string]) => {
    const res = await api.get('/mensajes-masivos/destinatarios', {
      params: { idCultivo: cultivo, campania },
    })
    return res.data as Destinatario[]
  }

  const { data: destinatarios = [], isLoading: loadingDestinatarios } = useSWR<Destinatario[]>(
    canWrite && idCultivo !== '' && periodo !== ''
      ? ['destinatarios', String(idCultivo), periodo]
      : null,
    destinatariosFetcher,
    { revalidateOnFocus: false }
  )

  const seleccionados = useMemo(
    () => destinatarios.filter((d) => !excluidos.includes(d.uid)),
    [destinatarios, excluidos]
  )

  const toggleDestinatario = (uid: string) => {
    setExcluidos((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    )
  }

  const cambiarCultivo = (v: string | number) => {
    setIdCultivo(v === '' ? '' : Number(v))
    setExcluidos([])
    setError(null)
  }

  const cambiarPeriodo = (v: string) => {
    setPeriodo(v)
    setExcluidos([])
    setError(null)
  }

  const handleEnviar = async () => {
    if (sending || idCultivo === '' || seleccionados.length === 0 || !mensaje.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await api.post<MensajeMasivoCreado>('/mensajes-masivos', {
        mensaje,
        idCultivo: Number(idCultivo),
        campania: periodo,
        uids: seleccionados.map((d) => d.uid),
      })
      // Abrir un chat por destinatario con el mensaje personalizado. Se hace
      // todo dentro del mismo gesto del click para minimizar el bloqueo de
      // popups del navegador; si aun así bloquea, el usuario debe permitir
      // popups para el sitio.
      for (const d of res.data.destinatarios) {
        window.open(waLink(d.celular, personalizar(mensaje, d.nombreUsuario)), '_blank')
      }
      navigate('/mensajes-masivos')
    } catch (e) {
      setError(mensajeError(e, 'No se pudo registrar el envío.'))
      setSending(false)
    }
  }

  if (!canWrite) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tienes permisos para ver esta sección.</p>
      </div>
    )
  }

  const inputCls = 'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'
  const labelCls = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5'

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/mensajes-masivos')}
          className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Nuevo mensaje masivo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Mensaje de WhatsApp a productores y asesores según cultivo
          </p>
        </div>
      </div>

      {/* Selectores */}
      <div className="bg-card/60 border border-border rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectAutocomplete
            label="Cultivo"
            value={idCultivo}
            onChange={cambiarCultivo}
            options={cultivos.map((c) => ({ value: c.id, label: c.nombre }))}
            placeholder="Seleccionar cultivo..."
            clearable
          />
          <div className="space-y-1">
            <label htmlFor="periodo" className={labelCls}>Período</label>
            <select
              id="periodo"
              value={periodo}
              onChange={(e) => cambiarPeriodo(e.target.value)}
              className={inputCls}
            >
              {periodosCampania().map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Se listan los productores y asesores de las empresas con producción del cultivo
          elegido en el período indicado, que tengan celular cargado.
        </p>
      </div>

      {/* Mensaje (izquierda) + destinatarios (derecha) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <label htmlFor="mensaje" className={labelCls}>Mensaje</label>
          <textarea
            id="mensaje"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={12}
            maxLength={4000}
            className={`${inputCls} resize-y leading-relaxed`}
            placeholder="Escribí el mensaje a enviar..."
          />
          <p className="text-xs text-muted-foreground">
            El texto <code className="px-1 py-0.5 bg-muted rounded text-[11px]">{TOKEN_NOMBRE}</code> se
            reemplaza por el nombre de cada destinatario al abrir su chat.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className={labelCls}>Destinatarios</span>
            <span className="text-xs text-muted-foreground">
              {seleccionados.length} de {destinatarios.length} seleccionados
            </span>
          </div>

          {idCultivo === '' ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Elegí un cultivo para ver los destinatarios.</p>
          ) : loadingDestinatarios ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Activity className="size-6 text-primary mb-2 animate-pulse" strokeWidth={1.75} />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Buscando destinatarios...</p>
            </div>
          ) : destinatarios.length === 0 ? (
            <div className="py-8 text-center">
              <MessagesSquare className="size-8 text-muted-foreground/40 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">
                No hay destinatarios con celular para esa combinación.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border max-h-[320px] overflow-y-auto -mx-1">
              {destinatarios.map((d) => {
                const marcado = !excluidos.includes(d.uid)
                return (
                  <li key={d.uid}>
                    <label className="flex items-start gap-2.5 px-1 py-2.5 cursor-pointer hover:bg-muted/40 rounded-md transition-colors">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => toggleDestinatario(d.uid)}
                        className="mt-0.5 size-4 accent-primary cursor-pointer"
                      />
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm text-foreground truncate">{d.nombreUsuario}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {d.celular}{d.empresas.length > 0 ? ` · ${d.empresas.join(', ')}` : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Enviar */}
      <div className="space-y-2">
        {error && (
          <p className="text-sm text-destructive inline-flex items-center gap-1.5">
            <AlertCircle className="size-4" strokeWidth={1.75} />
            {error}
          </p>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <p className="text-xs text-muted-foreground">
            Al enviar se abre una pestaña de WhatsApp por destinatario con el mensaje
            precargado. Si el navegador bloquea las ventanas emergentes, permitilas para este sitio.
          </p>
          <button
            onClick={handleEnviar}
            disabled={sending || idCultivo === '' || seleccionados.length === 0 || !mensaje.trim()}
            className="inline-flex cursor-pointer items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" strokeWidth={2} />}
            {sending ? 'Enviando…' : `Enviar a ${seleccionados.length} destinatario${seleccionados.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
