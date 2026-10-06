import { useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  AlertCircle, ChevronDown, ChevronUp, FlaskConical,
  Loader2, Plus, Trash2, Upload, X,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import SelectAutocomplete from './SelectAutocomplete'

interface Detalle {
  id?: number
  parametro: string
  etiqueta: string
  valorNum: number | null
  valorTexto: string | null
  unidad: string | null
  metodo?: string | null
}

interface Analisis {
  id: number
  laboratorio: string | null
  nroAnalisis: string | null
  fechaRecepcion: string | null
  fechaEmision: string | null
  profundidad: string | null
  muestra: string | null
  detalles: Detalle[]
}

interface Parametro {
  codigo: string
  etiqueta: string
  unidad: string | null
}

interface FilaPreview {
  key: string
  codigo: string
  etiqueta: string
  valorNum: string
  valorTexto: string
  unidad: string
}

interface PreviewCabecera {
  laboratorio: string
  nroAnalisis: string
  fechaRecepcion: string
  fechaEmision: string
  profundidad: string
  muestra: string
}

const fmtFecha = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('es-AR')
}

const fmtValor = (d: Detalle): string => {
  if (d.valorTexto) return d.valorTexto
  if (d.valorNum === null || d.valorNum === undefined) return '—'
  const n = Number(d.valorNum).toLocaleString('es-AR', { maximumFractionDigits: 4 })
  return d.unidad ? `${n} ${d.unidad}` : n
}

const tituloAnalisis = (a: Analisis): string => {
  const partes = [
    a.fechaEmision ? `Emisión ${fmtFecha(a.fechaEmision)}` : a.fechaRecepcion ? `Recepción ${fmtFecha(a.fechaRecepcion)}` : null,
    a.profundidad || null,
    a.nroAnalisis ? `N° ${a.nroAnalisis}` : null,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : `Análisis #${a.id}`
}

/**
 * Historial de análisis de suelo del lote (colapsado por defecto) con alta
 * por OCR: se sube el PDF/foto, se previsualiza lo extraído para aceptar o
 * ajustar, y recién ahí se guarda. El archivo original no se persiste.
 */
export default function AnalisisSueloSection({
  loteId,
  canWrite,
}: {
  loteId: number
  canWrite: boolean
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [cabecera, setCabecera] = useState<PreviewCabecera | null>(null)
  const [filas, setFilas] = useState<FilaPreview[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [nuevoCodigo, setNuevoCodigo] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: lista = [], isLoading, mutate } = useSWR<Analisis[]>(
    `/lotes/${loteId}/analisis-suelo`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: parametros = [] } = useSWR<Parametro[]>(
    cabecera ? '/analisis-suelo/parametros' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onFile = async (file: File | undefined) => {
    if (!file || uploading) return
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const { data } = await api.post(`/lotes/${loteId}/analisis-suelo/extraer`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      })
      const r = data as {
        laboratorio: string | null
        nroAnalisis: string | null
        fechaRecepcion: string | null
        fechaEmision: string | null
        profundidad: string | null
        muestra: string | null
        detalles: { codigo: string; etiqueta: string; valorNum: number | null; valorTexto: string | null; unidad: string | null }[]
      }
      setCabecera({
        laboratorio: r.laboratorio || '',
        nroAnalisis: r.nroAnalisis || '',
        fechaRecepcion: r.fechaRecepcion?.slice(0, 10) || '',
        fechaEmision: r.fechaEmision?.slice(0, 10) || '',
        profundidad: r.profundidad || '',
        muestra: r.muestra || '',
      })
      setFilas(
        (r.detalles || []).map((d, i) => ({
          key: `${d.codigo}-${i}`,
          codigo: d.codigo,
          etiqueta: d.etiqueta,
          valorNum: d.valorNum !== null && d.valorNum !== undefined ? String(d.valorNum) : '',
          valorTexto: d.valorTexto || '',
          unidad: d.unidad || '',
        })),
      )
      setSaveError(null)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } }; message?: string; code?: string }
      const msg = err?.response?.data?.message
      setUploadError(
        err?.code === 'ECONNABORTED'
          ? 'El procesamiento tardó demasiado. Probá con un archivo más liviano.'
          : Array.isArray(msg) ? msg.join(', ')
            : typeof msg === 'string' ? msg
              : err?.message || 'No se pudo extraer el informe.',
      )
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const filasValidas = useMemo(
    () =>
      filas.filter(
        (f) =>
          f.codigo.trim() !== '' &&
          (f.valorNum.trim() !== '' || f.valorTexto.trim() !== ''),
      ),
    [filas],
  )

  const handleSave = async () => {
    if (saving || filasValidas.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.post(`/lotes/${loteId}/analisis-suelo`, {
        laboratorio: cabecera?.laboratorio.trim() || undefined,
        nroAnalisis: cabecera?.nroAnalisis.trim() || undefined,
        fechaRecepcion: cabecera?.fechaRecepcion || undefined,
        fechaEmision: cabecera?.fechaEmision || undefined,
        profundidad: cabecera?.profundidad.trim() || undefined,
        muestra: cabecera?.muestra.trim() || undefined,
        detalles: filasValidas.map((f) => ({
          parametro: f.codigo.trim(),
          etiqueta: f.etiqueta.trim() || f.codigo.trim(),
          valorNum: f.valorNum.trim() === '' ? null : Number(f.valorNum),
          valorTexto: f.valorTexto.trim() || null,
          unidad: f.unidad.trim() || null,
        })),
      })
      setCabecera(null)
      setFilas([])
      setNuevoCodigo('')
      await mutate()
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } }; message?: string }
      const msg = err?.response?.data?.message
      setSaveError(Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : 'No se pudo guardar el análisis.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (idAnalisis: number) => {
    if (!window.confirm('¿Eliminar este análisis de suelo?')) return
    setDeletingId(idAnalisis)
    try {
      await api.delete(`/analisis-suelo/${idAnalisis}`)
      await mutate()
    } catch {
      // noop: se revalida igual
      await mutate()
    } finally {
      setDeletingId(null)
    }
  }

  const agregarFila = () => {
    if (!nuevoCodigo) return
    const p = parametros.find((x) => x.codigo === nuevoCodigo)
    if (!p) return
    setFilas((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}`,
        codigo: p.codigo,
        etiqueta: p.etiqueta,
        valorNum: '',
        valorTexto: '',
        unidad: p.unidad || '',
      },
    ])
    setNuevoCodigo('')
  }

  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical className="size-4 text-primary shrink-0" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Análisis de suelo{lista.length > 0 ? ` (${lista.length})` : ''}
          </h2>
        </div>
        {canWrite && !cabecera && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => { void onFile(e.target.files?.[0]) }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shrink-0"
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" strokeWidth={1.75} />}
              {uploading ? 'Extrayendo…' : 'Nuevo análisis'}
            </button>
          </>
        )}
      </div>

      {uploadError && (
        <p className="mx-4 mb-3 flex items-center gap-1.5 text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-md px-3 py-2">
          <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
          {uploadError}
        </p>
      )}

      {cabecera && (
        <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/20">
          <p className="text-xs text-muted-foreground">
            Revisá los datos extraídos: aceptalos, ajustalos o agregá filas antes de guardar.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 text-xs font-medium text-foreground">
              Laboratorio
              <input
                type="text"
                value={cabecera.laboratorio}
                onChange={(e) => setCabecera({ ...cabecera, laboratorio: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-foreground">
              N° análisis
              <input
                type="text"
                value={cabecera.nroAnalisis}
                onChange={(e) => setCabecera({ ...cabecera, nroAnalisis: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-foreground">
              Profundidad
              <input
                type="text"
                value={cabecera.profundidad}
                onChange={(e) => setCabecera({ ...cabecera, profundidad: e.target.value })}
                placeholder="000-020 cm"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-foreground">
              Fecha recepción
              <input
                type="date"
                value={cabecera.fechaRecepcion}
                onChange={(e) => setCabecera({ ...cabecera, fechaRecepcion: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-foreground">
              Fecha emisión
              <input
                type="date"
                value={cabecera.fechaEmision}
                onChange={(e) => setCabecera({ ...cabecera, fechaEmision: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-foreground">
              Muestra
              <input
                type="text"
                value={cabecera.muestra}
                onChange={(e) => setCabecera({ ...cabecera, muestra: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            {filas.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate text-xs text-foreground">{f.etiqueta}</span>
                <input
                  type="text"
                  value={f.valorNum}
                  onChange={(e) =>
                    setFilas((prev) => prev.map((x) => (x.key === f.key ? { ...x, valorNum: e.target.value } : x)))
                  }
                  placeholder="Valor"
                  inputMode="decimal"
                  className="w-24 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="text"
                  value={f.valorTexto}
                  onChange={(e) =>
                    setFilas((prev) => prev.map((x) => (x.key === f.key ? { ...x, valorTexto: e.target.value } : x)))
                  }
                  placeholder="Texto"
                  className="w-24 px-2 py-1.5 bg-background border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="text"
                  value={f.unidad}
                  onChange={(e) =>
                    setFilas((prev) => prev.map((x) => (x.key === f.key ? { ...x, unidad: e.target.value } : x)))
                  }
                  placeholder="Unidad"
                  className="w-20 px-2 py-1.5 bg-background border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => setFilas((prev) => prev.filter((x) => x.key !== f.key))}
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer shrink-0"
                  aria-label={`Quitar ${f.etiqueta}`}
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
            ))}
            {filas.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No se detectaron valores. Agregá filas manualmente o probá con un escaneo más nítido.
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <SelectAutocomplete
                value={nuevoCodigo}
                onChange={(v) => setNuevoCodigo(String(v))}
                options={[
                  { value: '', label: 'Agregar determinación…' },
                  ...parametros
                    .filter((p) => !filas.some((f) => f.codigo === p.codigo))
                    .map((p) => ({ value: p.codigo, label: p.etiqueta })),
                ]}
                className="flex-1 min-w-0"
              />
              <button
                onClick={agregarFila}
                disabled={!nuevoCodigo}
                className="inline-flex items-center gap-1 px-2.5 py-2 border border-border rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Plus className="size-3.5" strokeWidth={1.75} />
                Agregar
              </button>
            </div>
          </div>

          {saveError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-md px-3 py-2">
              <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
              {saveError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setCabecera(null); setFilas([]); setNuevoCodigo(''); setSaveError(null) }}
              disabled={saving}
              className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => { void handleSave() }}
              disabled={saving || filasValidas.length === 0}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? 'Guardando…' : `Guardar análisis (${filasValidas.length})`}
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-border divide-y divide-border">
        {isLoading && (
          <p className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Cargando análisis…
          </p>
        )}
        {!isLoading && lista.length === 0 && !cabecera && (
          <p className="px-4 py-4 text-xs text-muted-foreground text-center">
            Sin análisis cargados para este lote.
          </p>
        )}
        {lista.map((a) => {
          const open = expanded.has(a.id)
          return (
            <div key={a.id}>
              <button
                onClick={() => toggle(a.id)}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer text-left"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground truncate">{tituloAnalisis(a)}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {[a.laboratorio, a.muestra ? `Muestra: ${a.muestra}` : null].filter(Boolean).join(' · ') || '—'}
                    {' · '}
                    {a.detalles.length} {a.detalles.length === 1 ? 'valor' : 'valores'}
                  </span>
                </span>
                {canWrite && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Eliminar análisis"
                    onClick={(e) => { e.stopPropagation(); void handleDelete(a.id) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void handleDelete(a.id) } }}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer shrink-0"
                  >
                    {deletingId === a.id
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : <Trash2 className="size-3.5" strokeWidth={1.75} />}
                  </span>
                )}
                {open
                  ? <ChevronUp className="size-4 text-muted-foreground shrink-0" />
                  : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
              </button>
              {open && (
                <ul className="px-4 pb-3 pt-1 space-y-1 bg-muted/20">
                  {(a.nroAnalisis || a.laboratorio) && (
                    <li className="text-[11px] text-muted-foreground pb-1">
                      {[a.nroAnalisis ? `N° ${a.nroAnalisis}` : null, a.laboratorio].filter(Boolean).join(' · ')}
                      {a.fechaRecepcion ? ` · Recep. ${fmtFecha(a.fechaRecepcion)}` : ''}
                    </li>
                  )}
                  {a.detalles.map((d) => (
                    <li key={d.id ?? `${d.parametro}`} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="text-muted-foreground truncate">{d.etiqueta}</span>
                      <span className="font-medium text-foreground tabular-nums whitespace-nowrap">{fmtValor(d)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
