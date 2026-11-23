import { useMemo, useState, type ReactNode } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  X, Loader2, AlertCircle, CheckCircle2, FileDown, FileSpreadsheet,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { fmtFecha } from '../lib/prescripciones'
import { decimalADms } from '../lib/geo'
import SelectAutocomplete from './SelectAutocomplete'
import WhatsAppIcon from './WhatsAppIcon'

interface SegurosRow {
  id: number
  idLote: number
  idCultivo: number
  idVariedad: number | null
  supSembrada: number | null
  fechaSiembra: string | null
  fechaSiembraOrigen?: {
    fuente: 'labor' | 'manual'
    laborNombre?: string | null
  } | null
  idAseguradora: number | null
  qqAsegurados: number | null
  aseguradora?: { id: number; nombre: string } | null
  lote?: {
    id: number
    descripcion: string | null
    idEmpresa: number
    empresa?: { nombre: string } | null
    campo?: { nombre: string } | null
    centroide?: { lat: number; lng: number } | null
  } | null
  cultivo?: { nombre: string } | null
  variedad?: { nombre: string } | null
}

interface Aseguradora {
  id: number
  nombre: string
  activo: boolean
}

interface Cultivo {
  id: number
  nombre: string
  variedades: { id: number; nombre: string }[]
}

interface SegurosModalProps {
  ids: number[]
  onClose: () => void
  onSaved: () => void
}

const inputCls =
  'px-2 py-1 bg-background border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary'

/** Superficie como en la planilla (18,5 / 30, sin ceros de más). */
function fmtSup(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return String(Number(v.toFixed(2))).replace('.', ',')
}

export default function SegurosModal({ ids, onClose, onSaved }: SegurosModalProps) {
  const idsKey = useMemo(() => [...ids].sort((a, b) => a - b).join(','), [ids])

  const {
    data: filas,
    isLoading,
    error,
    mutate: mutateFilas,
  } = useSWR<SegurosRow[]>(
    ids.length > 0 ? `/campanias/seguros/planilla?ids=${idsKey}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: aseguradoras = [] } = useSWR<Aseguradora[]>(
    '/aseguradoras?soloActivas=true',
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: cultivos } = useSWR<Cultivo[]>(
    '/cultivos',
    fetcher,
    { revalidateOnFocus: false },
  )

  if (isLoading || !filas) {
    return (
      <ModalShell
        onClose={onClose}
        subtitle="Cargando…"
        body={
          <div className="flex flex-col items-center justify-center py-14">
            {error ? (
              <>
                <AlertCircle className="size-8 text-destructive mb-3" strokeWidth={1.5} />
                <p className="text-sm text-destructive">No se pudieron cargar las producciones.</p>
              </>
            ) : (
              <>
                <Loader2 className="size-6 text-primary mb-3 animate-spin" strokeWidth={1.75} />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando…</p>
              </>
            )}
          </div>
        }
      />
    )
  }

  return (
    <SegurosModalBody
      key={idsKey}
      ids={ids}
      filas={filas}
      aseguradoras={aseguradoras}
      cultivos={cultivos}
      onClose={onClose}
      onSaved={onSaved}
      onMutateFilas={() => mutateFilas()}
    />
  )
}

// Precarga por inicializadores de estado (sin efectos): el body se monta con
// `key` por selección, así los valores guardados (qq, fechas, aseguradora
// común) arrancan precargados y el usuario los edita libremente.
function SegurosModalBody({
  ids, filas, aseguradoras, cultivos, onClose, onSaved, onMutateFilas,
}: {
  ids: number[]
  filas: SegurosRow[]
  aseguradoras: Aseguradora[]
  cultivos: Cultivo[] | undefined
  onClose: () => void
  onSaved: () => void
  onMutateFilas: () => void
}) {
  const [aseguradoraId, setAseguradoraId] = useState<number | null>(() => {
    const comunes = new Set<number>()
    for (const f of filas) if (f.idAseguradora != null) comunes.add(f.idAseguradora)
    return comunes.size === 1 ? [...comunes][0] : null
  })
  const [qq, setQq] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      filas.filter((f) => f.qqAsegurados != null).map((f) => [f.id, String(f.qqAsegurados)]),
    ),
  )
  const [fechas, setFechas] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      filas.filter((f) => f.fechaSiembra).map((f) => [f.id, String(f.fechaSiembra).slice(0, 10)]),
    ),
  )
  const [variedades, setVariedades] = useState<Record<number, number | ''>>(() =>
    Object.fromEntries(
      filas.filter((f) => f.idVariedad != null).map((f) => [f.id, f.idVariedad as number]),
    ),
  )
  const [busy, setBusy] = useState<'csv' | 'xls' | 'compartir' | 'guardar' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const { mutate: mutateGlobal } = useSWRConfig()

  // Guardar datos de seguros actualiza campos de producción (campaña):
  // revalidar la cache SWR de producciones (listado "campanias" y detalle
  // /campanias/{id}) para que se vean en la navegación SPA sin recargar.
  const revalidarProducciones = () =>
    mutateGlobal(
      (key) =>
        (typeof key === 'string' && key.startsWith('/campanias')) ||
        (Array.isArray(key) && key[0] === 'campanias'),
      undefined,
      { revalidate: true },
    )

  const aseguradoraOpciones = useMemo(() => {
    const map = new Map<number, string>()
    for (const a of aseguradoras) map.set(a.id, a.nombre)
    // Mantiene visible la aseguradora guardada aunque esté inactiva.
    for (const f of filas ?? []) {
      if (f.aseguradora && !map.has(f.aseguradora.id)) {
        map.set(f.aseguradora.id, f.aseguradora.nombre)
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([value, label]) => ({ value, label }))
  }, [aseguradoras, filas])

  // Filas con labor de siembra: la fecha la define la labor y no es editable.
  const fechasBloqueadas = useMemo(
    () => new Set(filas.filter((f) => f.fechaSiembraOrigen?.fuente === 'labor').map((f) => f.id)),
    [filas],
  )

  // Se envían todos los valores del formulario (incluidos los vacíos, que el
  // servidor interpreta como "borrar"). Las filas no tocadas no están en el
  // estado y el servidor las deja como están. Las fechas bloqueadas por labor
  // no se envían (el servidor también las ignora).
  const buildPayload = () => ({
    ids,
    qq: { ...qq },
    fechaSiembra: Object.fromEntries(
      Object.entries(fechas).filter(([id]) => !fechasBloqueadas.has(Number(id))),
    ),
    idVariedad: { ...variedades },
    aseguradoraId,
  })

  const errorDe = (e: unknown, fallback: string): string => {
    const err = e as { response?: { data?: { message?: string | string[] } } }
    const msg = err?.response?.data?.message
    return Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : fallback
  }

  const descargar = async (formato: 'csv' | 'xls') => {
    if (aseguradoraId == null || busy) return
    setBusy(formato)
    setActionError(null)
    setOkMsg(null)
    try {
      const res = await api.post('/campanias/seguros/descargar', { ...buildPayload(), formato }, { responseType: 'blob' })
      const url = window.URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      const header = res.headers?.['content-disposition'] as string | undefined
      const match = header ? /filename="?([^";]+)"?/.exec(header) : null
      a.href = url
      a.download = match?.[1] || `seguros.${formato}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setOkMsg('Planilla generada y datos guardados en las producciones.')
      onSaved()
      await revalidarProducciones()
    } catch (e) {
      setActionError(errorDe(e, 'No se pudo generar la planilla.'))
    } finally {
      setBusy(null)
    }
  }

  const compartir = async () => {
    if (aseguradoraId == null || busy) return
    setBusy('compartir')
    setActionError(null)
    setOkMsg(null)
    try {
      const { data } = await api.post('/campanias/seguros/compartir', buildPayload())
      const url = (data as { url?: string }).url
      if (!url) throw new Error('sin url')
      const texto = `Planilla de seguros\n${url}`
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
      setOkMsg('Planilla generada y datos guardados en las producciones.')
      onSaved()
      await revalidarProducciones()
    } catch (e) {
      setActionError(errorDe(e, 'No se pudo generar la planilla para compartir.'))
    } finally {
      setBusy(null)
    }
  }

  // Guarda lo cargado (fechas de siembra, qq, aseguradora) sin descargar:
  // evita entrar al detalle de cada producción que no tiene fecha.
  const guardar = async () => {
    if (busy) return
    setBusy('guardar')
    setActionError(null)
    setOkMsg(null)
    try {
      await api.post('/campanias/seguros/guardar', buildPayload())
      setOkMsg('Datos guardados en las producciones.')
      onSaved()
      onMutateFilas()
      await revalidarProducciones()
    } catch (e) {
      setActionError(errorDe(e, 'No se pudieron guardar los datos.'))
    } finally {
      setBusy(null)
    }
  }

  const subtitle = `${filas.length} ${filas.length === 1 ? 'producción seleccionada' : 'producciones seleccionadas'}`

  return (
    <ModalShell
      onClose={onClose}
      subtitle={subtitle}
      body={
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Empresa de seguros</label>
                  <SelectAutocomplete
                    value={aseguradoraId ?? ''}
                    onChange={(v) => { setAseguradoraId(v === '' ? null : Number(v)); setOkMsg(null) }}
                    options={aseguradoraOpciones}
                    placeholder="Elegí empresa"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Con Guardar, Descargar o Compartir se guardan la empresa, los qq, las fechas de siembra y las variedades en cada producción.
                </p>
              </div>

              <div className="overflow-x-auto border border-border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {['Productor', 'Campo', 'Lote', 'Superficie', 'Cultivo', 'Latitud', 'Longitud', 'Fecha de siembra', 'Variedad', 'QQ a asegurar'].map((h, i) => (
                        <th
                          key={h}
                          className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap ${i >= 3 && i !== 7 ? 'text-right' : 'text-left'}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filas.map((f) => (
                      <tr key={f.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 text-foreground whitespace-nowrap">
                          {f.lote?.empresa?.nombre || `Productor #${f.lote?.idEmpresa ?? '—'}`}
                        </td>
                        <td className="px-3 py-2 text-foreground whitespace-nowrap">
                          {f.lote?.campo?.nombre || '—'}
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                          {f.lote?.descripcion || `Lote #${f.idLote}`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {fmtSup(f.supSembrada)}
                          {f.supSembrada != null && <span className="text-[10px] text-muted-foreground ml-0.5">ha</span>}
                        </td>
                        <td className="px-3 py-2 text-foreground whitespace-nowrap">
                          {f.cultivo?.nombre || '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {f.lote?.centroide?.lat != null ? decimalADms(Number(f.lote.centroide.lat)) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {f.lote?.centroide?.lng != null ? decimalADms(Number(f.lote.centroide.lng)) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {f.fechaSiembraOrigen?.fuente === 'labor' ? (
                            <span
                              className="text-sm text-foreground whitespace-nowrap"
                              title={`Se define en la labor "${f.fechaSiembraOrigen?.laborNombre ?? 'siembra'}"`}
                            >
                              {fmtFecha(f.fechaSiembra)}
                            </span>
                          ) : (
                            <input
                              type="date"
                              value={fechas[f.id] ?? ''}
                              onChange={(e) => setFechas((prev) => ({ ...prev, [f.id]: e.target.value }))}
                              title={f.fechaSiembra ? `Guardada: ${fmtFecha(f.fechaSiembra)}` : 'Sin fecha de siembra'}
                              className={inputCls + ' w-[130px]'}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {cultivos ? (
                            <div className="min-w-[150px]">
                              <SelectAutocomplete
                                value={variedades[f.id] ?? ''}
                                onChange={(v) => setVariedades((prev) => ({ ...prev, [f.id]: v === '' ? '' : Number(v) }))}
                                options={[
                                  { value: '', label: 'Sin variedad' },
                                  ...(cultivos.find((c) => c.id === f.idCultivo)?.variedades ?? []).map((v) => ({ value: v.id, label: v.nombre })),
                                ]}
                                placeholder="Sin variedad"
                              />
                            </div>
                          ) : (
                            <span className="text-foreground whitespace-nowrap">{f.variedad?.nombre || '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={qq[f.id] ?? ''}
                            onChange={(e) => setQq((prev) => ({ ...prev, [f.id]: e.target.value }))}
                            placeholder="0"
                            aria-label={`QQ a asegurar de ${f.lote?.descripcion || `producción #${f.id}`}`}
                            className={inputCls + ' w-[90px] text-right tabular-nums'}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Superficie = sup. sembrada · Coordenadas del centroide del lote · Las fechas definidas por labor de siembra no son editables ·{' '}
                {filas.some((f) => f.lote?.centroide == null) && (
                  <span className="text-warning-foreground font-medium">
                    Hay lotes sin coordenadas (mostrados con —).
                  </span>
                )}
              </p>

              {actionError && (
                <p className="text-xs text-destructive inline-flex items-center gap-1.5 bg-destructive-soft border border-destructive/20 rounded-md px-3 py-2">
                  <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {actionError}
                </p>
              )}
              {okMsg && (
                <p className="text-xs text-success inline-flex items-center gap-1.5 bg-success-soft border border-success/20 rounded-md px-3 py-2">
                  <CheckCircle2 className="size-3.5 shrink-0" strokeWidth={2} />
                  {okMsg}
                </p>
              )}
        </div>
      }
      footer={
        <>
          <div className="flex-1" />
          <button
            type="button"
            onClick={guardar}
            disabled={busy != null}
            title="Guarda fechas de siembra, qq y aseguradora sin descargar"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'guardar' ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" strokeWidth={1.75} />}
            Guardar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => descargar('csv')}
            disabled={aseguradoraId == null || busy != null}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'csv' ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" strokeWidth={1.75} />}
            Descargar CSV
          </button>
          <button
            type="button"
            onClick={() => descargar('xls')}
            disabled={aseguradoraId == null || busy != null}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'xls' ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" strokeWidth={1.75} />}
            Descargar Excel
          </button>
          <button
            type="button"
            onClick={compartir}
            disabled={aseguradoraId == null || busy != null}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-4 text-xs font-medium text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'compartir' ? <Loader2 className="size-3.5 animate-spin" /> : <WhatsAppIcon className="size-3.5" />}
            Compartir por WhatsApp
          </button>
        </>
      }
    />
  )
}

function ModalShell({
  onClose, subtitle, body, footer,
}: {
  onClose: () => void
  subtitle: string
  body: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[88rem] max-h-[90vh] bg-card border border-border rounded-lg shadow-xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border flex justify-between items-center gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Datos para seguros</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{body}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-border bg-muted/30 flex flex-wrap items-center gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
