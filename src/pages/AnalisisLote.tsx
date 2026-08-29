import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  AlertCircle, Activity, Loader2, MapPin, Layers, Thermometer, Droplets, CloudRain, Gauge,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import MapaLote from '../components/MapaLote'
import SelectAutocomplete from '../components/SelectAutocomplete'

const PERMISO_CLIMA = 'lectura:analisis-clima'

interface Lote {
  id: number
  idEmpresa: number
  descripcion: string | null
  idCampo?: number | null
  campo?: { id: number; nombre: string } | null
  geometria?: GeoJSON.GeoJsonObject | null
  centroide?: { lat: number; lng: number } | null
  area?: number | null
}

interface DiaSerie {
  fecha: string
  tMedia: number | null
  tMax: number | null
  tMin: number | null
  hr: number | null
  lluvia: number | null
  gdd: number | null
}

interface AgregadosClima {
  tMedia: number | null
  tMaxMedia: number | null
  tMaxAbs: number | null
  tMinMedia: number | null
  tMinAbs: number | null
  hrMedia: number | null
  lluviaTotal: number | null
  lluviaDiariaMedia: number | null
  gddPeriodo: number | null
  diasConDatos: number
}

interface FilaSerieAnual {
  anio: number
  tMedia: number | null
  tMax: number | null
  tMin: number | null
  hr: number | null
  lluvia: number | null
  gddMes: number | null
}

interface RespuestaClima {
  lote: { id: number; descripcion: string | null; campoNombre: string | null; empresaNombre: string | null }
  periodo: 'actual' | 'mes' | 'campania'
  campania: string | null
  agregados: AgregadosClima
  serie: DiaSerie[]
  serieAnual: FilaSerieAnual[] | null
}

type MetricaKey = 't2m' | 't2m_max' | 't2m_min' | 'hr' | 'lluvia' | 'gdd'
type PeriodoKey = 'actual' | 'mes' | 'campania'

const METRICAS: Array<{ key: MetricaKey; label: string; icon: React.ReactNode; campo: keyof AgregadosClima; campoSeria: keyof DiaSerie; dominio: [number, number]; rampa: string[] }> = [
  { key: 't2m', label: 'Temperatura media', icon: <Thermometer className="size-3.5" strokeWidth={1.75} />, campo: 'tMedia', campoSeria: 'tMedia', dominio: [-5, 40], rampa: ['#1d4ed8', '#3b82f6', '#facc15', '#f97316', '#dc2626'] },
  { key: 't2m_max', label: 'Temp. máxima', icon: <Thermometer className="size-3.5" strokeWidth={1.75} />, campo: 'tMaxMedia', campoSeria: 'tMax', dominio: [0, 45], rampa: ['#1d4ed8', '#3b82f6', '#facc15', '#f97316', '#dc2626'] },
  { key: 't2m_min', label: 'Temp. mínima', icon: <Thermometer className="size-3.5" strokeWidth={1.75} />, campo: 'tMinMedia', campoSeria: 'tMin', dominio: [-10, 30], rampa: ['#1d4ed8', '#3b82f6', '#facc15', '#f97316', '#dc2626'] },
  { key: 'hr', label: 'Humedad relativa', icon: <Droplets className="size-3.5" strokeWidth={1.75} />, campo: 'hrMedia', campoSeria: 'hr', dominio: [0, 100], rampa: ['#f59e0b', '#facc15', '#a3e635', '#22c55e', '#0284c7'] },
  { key: 'lluvia', label: 'Lluvia', icon: <CloudRain className="size-3.5" strokeWidth={1.75} />, campo: 'lluviaTotal', campoSeria: 'lluvia', dominio: [0, 1], rampa: ['#f8fafc', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'] },
  { key: 'gdd', label: 'GDD', icon: <Gauge className="size-3.5" strokeWidth={1.75} />, campo: 'gddPeriodo', campoSeria: 'gdd', dominio: [0, 1], rampa: ['#f1f5f9', '#d1fae5', '#6ee7b7', '#10b981', '#047857'] },
]

const PERIODOS: Array<{ key: PeriodoKey; label: string }> = [
  { key: 'actual', label: 'Actual' },
  { key: 'mes', label: 'Mes' },
  { key: 'campania', label: 'Campaña' },
]

const fetcher = (url: string) => api.get(url).then((r) => r.data)

const fmtNum = (v: number | null | undefined, dec: number): string =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: 0 })

const mesActual = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function AnalisisLote() {
  const { permisos, user, isSysAdmin, isAsesorAdmin, empresas } = useAuth()
  const canRead = permisos.includes(PERMISO_CLIMA)
  const isAdmin = isSysAdmin || isAsesorAdmin
  const userEmpresas = (user?.idEmpresas || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)

  const [idEmpresa, setIdEmpresa] = useState<number | ''>('')
  const [idCampo, setIdCampo] = useState<number | ''>('')
  const [idLote, setIdLote] = useState<number | ''>('')
  const [periodo, setPeriodo] = useState<PeriodoKey>('actual')
  const [mesFecha, setMesFecha] = useState(mesActual())
  const [metrica, setMetrica] = useState<MetricaKey>('t2m')

  const empresasVisibles = isAdmin ? empresas : empresas.filter((e) => userEmpresas.includes(e.id))

  const { data: lotes = [], isLoading: loadingLotes } = useSWR<Lote[]>(
    canRead ? '/lotes' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const camposDelProductor = useMemo(() => {
    if (idEmpresa === '') return []
    const seen = new Map<number, string>()
    let sinCampo = false
    for (const l of lotes) {
      if (l.idEmpresa !== Number(idEmpresa)) continue
      if (l.campo) seen.set(l.campo.id, l.campo.nombre)
      else sinCampo = true
    }
    const opciones = Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([value, label]) => ({ value, label }))
    if (sinCampo) opciones.push({ value: 0, label: 'Sin campo' })
    return opciones
  }, [lotes, idEmpresa])

  const lotesDelCampo = useMemo(() => {
    if (idEmpresa === '' || idCampo === '') return []
    const target = idCampo === 0 ? null : Number(idCampo)
    return lotes
      .filter((l) => l.idEmpresa === Number(idEmpresa) && (l.idCampo ?? null) === target)
      .sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || '', 'es'))
  }, [lotes, idEmpresa, idCampo])

  const loteSel = useMemo(() => {
    if (idLote === '') return null
    return lotes.find((l) => l.id === Number(idLote)) ?? null
  }, [lotes, idLote])

  const climaFetcher = async ([, loteId, periodoKey, fechaMes]: [string, number, PeriodoKey, string]) => {
    const params: Record<string, unknown> = { periodo: periodoKey }
    if (periodoKey === 'mes') params.fecha = fechaMes
    const res = await api.get(`/analisis/lote/${loteId}/clima`, { params })
    return res.data as RespuestaClima
  }

  const { data: clima, isLoading: loadingClima, error: climaError } = useSWR<RespuestaClima>(
    canRead && loteSel ? ['analisis-clima', loteSel.id, periodo, mesFecha] : null,
    climaFetcher,
    { revalidateOnFocus: false },
  )

  const metricaDef = METRICAS.find((m) => m.key === metrica)!

  const valorAgregado = clima ? clima.agregados[metricaDef.campo] as number | null : null

  const fillColor = useMemo(() => {
    if (!clima || valorAgregado == null) return '#38bdf8'
    const valores = (clima.serie || [])
      .map((d) => d[metricaDef.campoSeria] ?? null)
      .filter((v): v is number => v != null)
    const min = valores.length > 0 ? Math.min(...valores) : metricaDef.dominio[0]
    const max = valores.length > 0 ? Math.max(...valores) : metricaDef.dominio[1]
    const t = max > min ? Math.min(1, Math.max(0, (valorAgregado - min) / (max - min))) : 0.5
    return interpolateRampa(metricaDef.rampa, t)
  }, [clima, valorAgregado, metricaDef])

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permiso para este servicio.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center gap-2.5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Análisis de lote</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Capas de clima histórico/actual sobre los lotes (NASA POWER)
          </p>
        </div>
      </div>

      {/* Cascada + capa */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SelectAutocomplete
            label="Productor"
            value={idEmpresa}
            onChange={(v) => { setIdEmpresa(v === '' ? '' : Number(v)); setIdCampo(''); setIdLote('') }}
            options={empresasVisibles.map((e) => ({ value: e.id, label: e.nombre }))}
            placeholder="Seleccionar productor..."
            autoSelectSingle
          />
          <SelectAutocomplete
            label="Campo"
            value={idCampo}
            onChange={(v) => { setIdCampo(v === '' ? '' : Number(v)); setIdLote('') }}
            options={camposDelProductor.map((c) => ({ value: c.value, label: c.label }))}
            placeholder={idEmpresa === '' ? 'Elegí productor' : 'Seleccionar campo...'}
            disabled={idEmpresa === ''}
            autoSelectSingle
          />
          <SelectAutocomplete
            label="Lote"
            value={idLote}
            onChange={(v) => setIdLote(v === '' ? '' : Number(v))}
            options={lotesDelCampo.map((l) => ({ value: l.id, label: l.descripcion || `Lote #${l.id}` }))}
            placeholder={idCampo === '' ? 'Elegí campo' : 'Seleccionar lote...'}
            disabled={idCampo === ''}
            autoSelectSingle
          />
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Layers className="size-3" strokeWidth={2} /> Capa · clima
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">Métrica</label>
              <div className="flex flex-wrap rounded-md border border-border overflow-hidden">
                {METRICAS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMetrica(m.key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${metrica === m.key ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-muted'}`}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">Período</label>
              <div className="flex rounded-md border border-border overflow-hidden">
                {PERIODOS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPeriodo(p.key)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${periodo === p.key ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-muted'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {periodo === 'mes' && (
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">Mes</label>
                <input
                  type="month"
                  value={mesFecha}
                  onChange={(e) => setMesFecha(e.target.value || mesActual())}
                  className="px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary cursor-pointer"
                />
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Fuente: NASA POWER (grid MERRA2 de ~50 km). Los valores del lote corresponden a su centroide.
          </p>
        </div>
      </div>

      {/* Mapa + leyenda */}
      {!loteSel ? (
        <div className="bg-card border border-border rounded-lg p-16 text-center">
          <MapPin className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Elegí productor, campo y lote para ver el análisis.</p>
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 w-full">
            <MapaLote
              altura="h-[420px]"
              geometria={loteSel.geometria}
              centroide={loteSel.centroide}
              fillColor={fillColor}
              fillOpacity={0.4}
            />
          </div>

          <div className="w-full xl:w-72 shrink-0 space-y-3">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1 truncate" title={loteSel.descripcion || ''}>
                {loteSel.descripcion || `Lote #${loteSel.id}`}
              </h3>
              <p className="text-xs text-muted-foreground">
                {loteSel.campo?.nombre || 'Sin campo'} · {empresas.find((e) => e.id === loteSel.idEmpresa)?.nombre || ''}
              </p>

              <div className="mt-4 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {metricaDef.label}
                  {clima?.campania ? ` (${clima.campania})` : ''}
                </p>
                <p className="text-3xl font-semibold text-foreground tabular-nums">
                  {loadingClima ? (
                    <Loader2 className="size-6 inline animate-spin text-primary" strokeWidth={1.75} />
                  ) : (
                    fmtNum(valorAgregado, metrica === 'lluvia' ? 1 : 0)
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">{unidadDe(metrica, periodo)}</p>
              </div>

              <div className="mt-4 space-y-1">
                <div
                  className="h-3 rounded-full"
                  style={{ background: `linear-gradient(to right, ${metricaDef.rampa.join(', ')})` }}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{fmtLeyenda('min', metrica, metricaDef)}</span>
                  <span>{fmtLeyenda('max', metrica, metricaDef)}</span>
                </div>
              </div>
            </div>

            {climaError && (
              <p className="text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-md px-3 py-2 inline-flex items-center gap-1.5">
                <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
                {climaError.message || 'No se pudo consultar el clima.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tablas */}
      {clima && (
        <>
          <section className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Resumen {PERIODOS.find((p) => p.key === periodo)?.label} {clima.campania ? `· campaña ${clima.campania}` : ''}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DatoRes label="Temperatura media" valor={fmtNum(clima.agregados.tMedia, 1)} unidad="°C" />
              <DatoRes label="Máxima media / abs" valor={`${fmtNum(clima.agregados.tMaxMedia, 1)} / ${fmtNum(clima.agregados.tMaxAbs, 1)}`} unidad="°C" />
              <DatoRes label="Mínima media / abs" valor={`${fmtNum(clima.agregados.tMinMedia, 1)} / ${fmtNum(clima.agregados.tMinAbs, 1)}`} unidad="°C" />
              <DatoRes label="Humedad relativa" valor={fmtNum(clima.agregados.hrMedia, 0)} unidad="%" />
              <DatoRes label="Lluvia total" valor={fmtNum(clima.agregados.lluviaTotal, 1)} unidad="mm" />
              <DatoRes label="Lluvia diaria media" valor={fmtNum(clima.agregados.lluviaDiariaMedia, 1)} unidad="mm" />
              <DatoRes label="GDD (base 10)" valor={fmtNum(clima.agregados.gddPeriodo, 0)} unidad="" />
              <DatoRes label="Días con datos" valor={String(clima.agregados.diasConDatos)} unidad="" />
            </div>
          </section>

          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Serie {periodo === 'campania' ? 'mensual' : 'diaria'}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <Th>Fecha</Th>
                    <Th right>T media</Th>
                    <Th right>T máx</Th>
                    <Th right>T mín</Th>
                    <Th right>Humedad</Th>
                    <Th right>Lluvia</Th>
                    <Th right>GDD</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clima.serie.map((d, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-foreground whitespace-nowrap">{d.fecha}</td>
                      <Td right>{fmtNum(d.tMedia, 1)}</Td>
                      <Td right>{fmtNum(d.tMax, 1)}</Td>
                      <Td right>{fmtNum(d.tMin, 1)}</Td>
                      <Td right>{fmtNum(d.hr, 0)}</Td>
                      <Td right>{fmtNum(d.lluvia, 1)}</Td>
                      <Td right>{fmtNum(d.gdd, 0)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {clima.serie.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {loadingLotes ? 'Cargando...' : 'Sin datos para el período elegido.'}
                </p>
              )}
            </div>
          </section>

          {periodo === 'mes' && clima.serieAnual && (
            <section className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Mismo mes · últimos {clima.serieAnual.length} años
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <Th>Año</Th>
                      <Th right>T media</Th>
                      <Th right>T máx</Th>
                      <Th right>T mín</Th>
                      <Th right>Humedad</Th>
                      <Th right>Lluvia</Th>
                      <Th right>GDD mes</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {clima.serieAnual.map((a) => (
                      <tr key={a.anio}>
                        <td className="px-4 py-2 font-medium text-foreground">{a.anio}</td>
                        <Td right>{fmtNum(a.tMedia, 1)}</Td>
                        <Td right>{fmtNum(a.tMax, 1)}</Td>
                        <Td right>{fmtNum(a.tMin, 1)}</Td>
                        <Td right>{fmtNum(a.hr, 0)}</Td>
                        <Td right>{fmtNum(a.lluvia, 1)}</Td>
                        <Td right>{fmtNum(a.gddMes, 0)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {loadingClima && loteSel && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="size-4 animate-pulse" strokeWidth={1.75} />
          Consultando clima de {loteSel.descripcion || `Lote #${loteSel.id}`}...
        </div>
      )}
    </div>
  )
}

function DatoRes({ label, valor, unidad }: { label: string; valor: string; unidad: string }) {
  return (
    <div className="bg-muted/30 border border-border rounded-md p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground tabular-nums mt-0.5">
        {valor} <span className="text-xs font-normal text-muted-foreground">{unidad}</span>
      </p>
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <td className={`px-4 py-2 text-sm text-foreground tabular-nums ${right ? 'text-right' : 'text-left'}`}>{children}</td>
  )
}

function unidadDe(metrica: MetricaKey, periodo: PeriodoKey): string {
  if (metrica === 'lluvia') return periodo === 'actual' ? 'mm (7 días)' : 'mm (período)'
  if (metrica === 'gdd') return 'grados-día (base 10)'
  if (metrica.startsWith('t2m')) return '°C'
  return '%'
}

function fmtLeyenda(pos: 'min' | 'max', metrica: MetricaKey, def: (typeof METRICAS)[number]): string {
  if (metrica === 't2m') return pos === 'min' ? 'Frío' : 'Calor'
  if (metrica === 't2m_max' || metrica === 't2m_min') return pos === 'min' ? 'Bajo' : 'Alto'
  if (metrica === 'hr') return pos === 'min' ? 'Seco' : 'Húmedo'
  if (metrica === 'lluvia') return pos === 'min' ? 'Seco' : 'Lluvioso'
  if (metrica === 'gdd') return pos === 'min' ? 'Poco' : 'Mucho'
  return def.dominio.map((n) => String(n)).join(' – ')
}

function interpolateRampa(rampa: string[], t: number): string {
  if (t <= 0) return rampa[0]
  if (t >= 1) return rampa[rampa.length - 1]
  const pos = t * (rampa.length - 1)
  const i = Math.floor(pos)
  const frac = pos - i
  return mezclarHex(rampa[i], rampa[i + 1], frac)
}

function mezclarHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const r = Math.round(ca.r + (cb.r - ca.r) * t)
  const g = Math.round(ca.g + (cb.g - ca.g) * t)
  const bl = Math.round(ca.b + (cb.b - ca.b) * t)
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

function hexToRgb(h: string): { r: number; g: number; b: number } {
  const n = parseInt(h.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}