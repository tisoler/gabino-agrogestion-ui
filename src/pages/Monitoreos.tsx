import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  Plus, AlertCircle, Calendar, Loader2, Telescope, MapPin, Sprout,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import MonitoreoModal from '../components/MonitoreoModal'
import MonitoreoDetalleModal from '../components/MonitoreoDetalleModal'
import { fmtFecha } from '../lib/prescripciones'
import { periodosCampania } from '../lib/campanias'
import MultiselectFilter from '../components/MultiselectFilter'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

interface MonitoreoListItem {
  id: number
  fecha: string
  hora: string
  diagnostico: string
  observaciones: string | null
  campania?: {
    id: number
    campania?: string
    lote?: {
      id: number
      descripcion: string | null
      idEmpresa: number
      campo?: { id: number; nombre: string } | null
    } | null
    cultivo?: { id: number; nombre: string } | null
    variedad?: { id: number; nombre: string } | null
  } | null
}

interface Lote {
  id: number
  idEmpresa: number
  descripcion: string | null
  idCampo?: number | null
  campo?: { id: number; nombre: string } | null
}

interface Cultivo {
  id: number
  nombre: string
  variedades: { id: number; nombre: string }[]
}

export default function Monitoreos() {
  const { permisos, isSysAdmin, isAsesor, user, empresas } = useAuth()
  const isAdmin = isSysAdmin
  const canRead = permisos.includes('lectura:monitoreo-lote')
  const canWrite = permisos.includes('escritura:monitoreo-lote') && (isAdmin || isAsesor)

  const userEmpresas = (user?.idEmpresas || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)

  // Filtros (misma lógica que /campanias)
  const [filterEmpresaIds, setFilterEmpresaIds] = useState<number[]>([])
  const filterEmpresasVisibles = isAdmin ? empresas : empresas.filter((e) => userEmpresas.includes(e.id))
  const [filterCampanias, setFilterCampanias] = useState<string[]>([])
  const [filterCampoIds, setFilterCampoIds] = useState<number[]>([])
  const [filterLoteIds, setFilterLoteIds] = useState<number[]>([])
  const [filterCultivoIds, setFilterCultivoIds] = useState<number[]>([])
  const [filterVariedadIds, setFilterVariedadIds] = useState<number[]>([])

  const { data: cultivos = [] } = useSWR<Cultivo[]>(canRead ? '/cultivos' : null, fetcher)
  const { data: lotes = [] } = useSWR<Lote[]>(canRead ? '/lotes' : null, fetcher)

  const variedadesFiltradas = useMemo(() => {
    if (filterCultivoIds.length === 0) return []
    const seen = new Map<number, string>()
    for (const id of filterCultivoIds) {
      const c = cultivos.find((x) => x.id === id)
      for (const v of c?.variedades || []) seen.set(v.id, v.nombre)
    }
    return Array.from(seen.entries()).map(([id, nombre]) => ({ id, nombre }))
  }, [cultivos, filterCultivoIds])

  const variedadIdsEfectivos = useMemo(
    () => filterVariedadIds.filter((id) => variedadesFiltradas.some((v) => v.id === id)),
    [filterVariedadIds, variedadesFiltradas],
  )

  const lotesDeProductor = useMemo(() => {
    if (!lotes) return []
    if (filterEmpresaIds.length > 0) {
      return lotes.filter((l) => filterEmpresaIds.includes(l.idEmpresa))
    }
    return lotes
  }, [lotes, filterEmpresaIds])

  const camposDisponibles = useMemo(() => {
    const seen = new Map<number, string>()
    let sinCampo = false
    for (const l of lotesDeProductor) {
      if (l.campo) seen.set(l.campo.id, l.campo.nombre)
      else sinCampo = true
    }
    const opciones = Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([value, label]) => ({ value, label }))
    if (sinCampo) opciones.push({ value: 0, label: 'Sin campo' })
    return opciones
  }, [lotesDeProductor])

  const lotesFiltrados = useMemo(() => {
    if (filterCampoIds.length === 0) return lotesDeProductor
    const sinCampo = filterCampoIds.includes(0)
    const campos = new Set(filterCampoIds.filter((n) => n !== 0))
    return lotesDeProductor.filter((l) => {
      const lc = l.idCampo ?? null
      if (lc == null) return sinCampo
      return campos.has(lc)
    })
  }, [lotesDeProductor, filterCampoIds])

  const loteIdsEfectivos = useMemo(
    () => filterLoteIds.filter((id) => lotesFiltrados.some((l) => l.id === id)),
    [filterLoteIds, lotesFiltrados],
  )

  const monitoreosFetcher = async ([, empresaIds, campanias, campos, lotesIds, cultivos, variedades]: [string, string, string, string, string, string, string]) => {
    const params: Record<string, unknown> = {}
    if (empresaIds) params.empresaIds = empresaIds
    if (campanias) params.campanias = campanias
    if (campos) params.idCampo = campos
    if (lotesIds) params.idLote = lotesIds
    if (cultivos) params.idCultivo = cultivos
    if (variedades) params.idVariedad = variedades
    const res = await api.get('/monitoreos', { params })
    return res.data as MonitoreoListItem[]
  }

  const { data: monitoreos = [], isLoading, mutate: revalidarMonitoreos } = useSWR<MonitoreoListItem[]>(
    canRead
      ? ['monitoreos', filterEmpresaIds.join(','), filterCampanias.join(','), filterCampoIds.join(','), loteIdsEfectivos.join(','), filterCultivoIds.join(','), variedadIdsEfectivos.join(',')]
      : null,
    monitoreosFetcher,
    { revalidateOnFocus: false },
  )

  const [showModal, setShowModal] = useState(false)
  const [detalle, setDetalle] = useState<MonitoreoListItem | null>(null)

  const nombreEmpresa = (idEmpresa: number | undefined): string =>
    filterEmpresasVisibles.find((e) => e.id === idEmpresa)?.nombre
    ?? empresas.find((e) => e.id === idEmpresa)?.nombre
    ?? (idEmpresa != null ? `Productor #${idEmpresa}` : '—')

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver monitoreos.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Monitoreo en lote</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visitas y observaciones del asesor sobre cada producción.</p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={2} />
            Nuevo monitoreo
          </button>
        )}
      </div>

      {showModal && (
        <MonitoreoModal
          onCreated={() => {
            setShowModal(false)
            revalidarMonitoreos()
          }}
          onClose={() => setShowModal(false)}
        />
      )}

      {detalle && (
        <MonitoreoDetalleModal
          monitoreo={detalle}
          productor={nombreEmpresa(detalle.campania?.lote?.idEmpresa)}
          onClose={() => setDetalle(null)}
        />
      )}

      {/* Filtros */}
      <div className="bg-card border border-border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Productor</label>
          <MultiselectFilter
            value={filterEmpresaIds.map(String)}
            opciones={filterEmpresasVisibles.map((e) => ({ value: String(e.id), label: e.nombre }))}
            onChange={(v) => setFilterEmpresaIds(v.map(Number))}
            placeholder="Todos los productores"
            etiqueta="productor"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Campaña</label>
          <MultiselectFilter
            value={filterCampanias}
            opciones={periodosCampania().map((p) => ({ value: p, label: p }))}
            onChange={setFilterCampanias}
            placeholder="Todas las campañas"
            etiqueta="campaña"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Campo</label>
          <MultiselectFilter
            value={filterCampoIds.map(String)}
            opciones={camposDisponibles.map((o) => ({ value: String(o.value), label: o.label }))}
            onChange={(v) => setFilterCampoIds(v.map(Number))}
            placeholder="Todos los campos"
            etiqueta="campo"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Lote</label>
          <MultiselectFilter
            value={loteIdsEfectivos.map(String)}
            opciones={lotesFiltrados.map((l) => ({ value: String(l.id), label: l.descripcion || `Lote #${l.id}` }))}
            onChange={(v) => setFilterLoteIds(v.map(Number))}
            placeholder="Todos los lotes"
            etiqueta="lote"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Cultivo</label>
          <MultiselectFilter
            value={filterCultivoIds.map(String)}
            opciones={cultivos.map((c) => ({ value: String(c.id), label: c.nombre }))}
            onChange={(v) => { setFilterCultivoIds(v.map(Number)); setFilterVariedadIds([]) }}
            placeholder="Todos los cultivos"
            etiqueta="cultivo"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Variedad</label>
          <MultiselectFilter
            value={variedadIdsEfectivos.map(String)}
            opciones={variedadesFiltradas.map((v) => ({ value: String(v.id), label: v.nombre }))}
            onChange={(v) => setFilterVariedadIds(v.map(Number))}
            placeholder={filterCultivoIds.length === 0 ? 'Elegí cultivo primero' : 'Todas las variedades'}
            etiqueta="variedad"
          />
        </div>
      </div>

      {/* Listado */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Cargando monitoreos...</span>
        </div>
      ) : monitoreos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-card border border-border rounded-lg">
          <Telescope className="size-10 text-muted-foreground mb-3" strokeWidth={1.5} />
          <p className="text-sm font-medium text-foreground">Sin monitoreos</p>
          <p className="text-sm text-muted-foreground mt-1">No hay monitoreos para los filtros elegidos.</p>
        </div>
      ) : (
        <>
          {/* Móvil: cards */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {monitoreos.map((m) => (
              <div
                key={m.id}
                onClick={() => setDetalle(m)}
                className="bg-card border border-border rounded-lg p-4 space-y-3 cursor-pointer transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-foreground leading-tight truncate">
                    {m.campania?.lote?.descripcion || (m.campania?.lote ? `Lote #${m.campania.lote.id}` : 'Monitoreo')}
                    <span className="font-normal text-muted-foreground">
                      {m.campania?.campania ? ` · ${m.campania.campania}` : ''}
                    </span>
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5 text-sm text-muted-foreground tabular-nums">
                    <Calendar className="size-3.5" strokeWidth={1.75} />
                    {fmtFecha(m.fecha)} · {m.hora?.slice(0, 5)}
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Productor</dt>
                    <dd className="text-foreground truncate">{nombreEmpresa(m.campania?.lote?.idEmpresa)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campo</dt>
                    <dd className="text-foreground truncate">{m.campania?.lote?.campo?.nombre || 'Sin campo'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cultivo</dt>
                    <dd className="text-foreground truncate">{m.campania?.cultivo?.nombre || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Variedad</dt>
                    <dd className="text-foreground truncate">{m.campania?.variedad?.nombre || '—'}</dd>
                  </div>
                </dl>

                <p className="text-sm text-foreground line-clamp-2 leading-snug pt-2 border-t border-border">
                  {m.diagnostico}
                </p>
              </div>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden sm:block bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fecha</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Hora</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Productor</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Campaña</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Campo</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lote</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cultivo</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {monitoreos.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => setDetalle(m)}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm text-foreground">{fmtFecha(m.fecha)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        <span className="text-sm text-foreground">{m.hora?.slice(0, 5)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground line-clamp-2 leading-tight">
                          {nombreEmpresa(m.campania?.lote?.idEmpresa)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-foreground">{m.campania?.campania || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground truncate">
                          {m.campania?.lote?.campo?.nombre || 'Sin campo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MapPin className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm text-foreground truncate">
                            {m.campania?.lote?.descripcion || (m.campania?.lote ? `Lote #${m.campania.lote.id}` : '—')}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Sprout className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm text-foreground truncate">
                            {m.campania?.cultivo
                              ? `${m.campania.cultivo.nombre}${m.campania.variedad ? ` (${m.campania.variedad.nombre})` : ''}`
                              : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-72">
                        <span className="text-sm text-foreground line-clamp-2 leading-tight" title={m.diagnostico}>
                          {m.diagnostico}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
