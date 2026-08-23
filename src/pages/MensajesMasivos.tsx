import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, AlertCircle, Activity, MessagesSquare, Calendar, Sprout, User,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import MultiselectFilter from '../components/MultiselectFilter'
import { periodosCampania } from '../lib/campanias'
import {
  fmtFechaHora,
  type MensajeMasivoListItem,
} from '../lib/mensajes-masivos'

const fetcher = (url: string) => api.get(url).then((r) => r.data)

export default function MensajesMasivos() {
  const navigate = useNavigate()
  const { permisos } = useAuth()
  const canRead = permisos.includes('lectura:mensaje-masivo')
  const canWrite = permisos.includes('escritura:mensaje-masivo')

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCampanias, setFilterCampanias] = useState<string[]>([])
  const [filterCultivoIds, setFilterCultivoIds] = useState<number[]>([])

  const { data: mensajes = [], isLoading } = useSWR<MensajeMasivoListItem[]>(
    canRead ? '/mensajes-masivos' : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // Campaña filtra la lista de cultivos disponibles (cascada).
  const registrosPorCampania = useMemo(() => {
    if (filterCampanias.length === 0) return mensajes
    return mensajes.filter((m) => filterCampanias.includes(m.campania))
  }, [mensajes, filterCampanias])

  const cultivosDisponibles = useMemo(() => {
    const seen = new Map<number, string>()
    for (const m of registrosPorCampania) {
      if (m.cultivo) seen.set(m.cultivo.id, m.cultivo.nombre)
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [registrosPorCampania])

  // Igual que `lotesEfectivos`: la selección se poda a opciones vigentes.
  const cultivosEfectivos = useMemo(
    () => filterCultivoIds.filter((id) => cultivosDisponibles.some((c) => c.value === id)),
    [filterCultivoIds, cultivosDisponibles]
  )

  // Opciones de campaña: presentes en el historial, ordenadas por período
  // (más reciente primero, como en Producción/Prescripciones).
  const opcionesCampania = useMemo(() => {
    const presentes = new Set(mensajes.map((m) => m.campania))
    return periodosCampania()
      .filter((p) => presentes.has(p))
      .map((p) => ({ value: p, label: p }))
  }, [mensajes])

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return registrosPorCampania.filter((m) => {
      if (cultivosEfectivos.length > 0) {
        if (m.idCultivo == null || !cultivosEfectivos.includes(m.idCultivo)) return false
      }
      if (term && !m.mensaje.toLowerCase().includes(term)) return false
      return true
    })
  }, [registrosPorCampania, cultivosEfectivos, searchTerm])

  const hasActiveFilters =
    filterCampanias.length > 0 || cultivosEfectivos.length > 0 || searchTerm.trim() !== ''

  const clearFilters = () => {
    setSearchTerm('')
    setFilterCampanias([])
    setFilterCultivoIds([])
  }

  const goToDetail = (id: number) => navigate(`/mensajes-masivos/${id}`)
  const goToCreate = () => navigate('/mensajes-masivos/nueva')

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tienes permisos para ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Mensajes masivos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Historial de mensajes de WhatsApp enviados por cultivo
          </p>
        </div>
        {canWrite && (
          <button
            onClick={goToCreate}
            className="inline-flex cursor-pointer items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
          >
            <Plus className="size-4" strokeWidth={2} />
            <span>Nuevo mensaje</span>
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-card/60 border border-border rounded-lg p-3 space-y-3">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Buscar por mensaje..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Campaña
            </label>
            <MultiselectFilter
              value={filterCampanias}
              opciones={opcionesCampania}
              onChange={setFilterCampanias}
              placeholder="Todas"
              etiqueta="período"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Cultivo
            </label>
            <MultiselectFilter
              value={cultivosEfectivos.map(String)}
              opciones={cultivosDisponibles.map((c) => ({ value: String(c.value), label: c.label }))}
              onChange={(next) => setFilterCultivoIds(next.map(Number))}
              placeholder="Todos"
              etiqueta="cultivo"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <button
              onClick={clearFilters}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <AlertCircle className="size-3" strokeWidth={2} />
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Grilla */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border border-dashed">
          <Activity className="size-8 text-primary mb-3 animate-pulse" strokeWidth={1.75} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargando mensajes...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <MessagesSquare className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground mb-1">
            {mensajes.length === 0 ? 'Todavía no se enviaron mensajes masivos.' : 'Ningún mensaje coincide con los filtros.'}
          </p>
          {canWrite && mensajes.length === 0 && (
            <button
              onClick={goToCreate}
              className="text-sm font-medium text-primary hover:underline mt-1"
            >
              Enviar el primer mensaje
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {filtered.map((m) => (
              <div
                key={m.id}
                onClick={() => goToDetail(m.id)}
                className="bg-card border border-border rounded-lg p-4 space-y-3 cursor-pointer transition-colors hover:bg-muted/40"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar className="size-3.5" strokeWidth={1.75} />
                      {fmtFechaHora(m.fecha)}
                    </div>
                    <div className="flex flex-col mt-1 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">
                        {m.nombreEmisor || m.emailEmisor || '—'}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{m.emailEmisor || '—'}</span>
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center px-2 py-0.5 bg-accent border border-border rounded text-[11px] font-medium text-foreground">
                    {m.campania}
                  </span>
                </div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Sprout className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                    <dd className="text-foreground">{m.cultivo?.nombre || '—'}</dd>
                  </div>
                  <p className="text-foreground/90 line-clamp-2 whitespace-pre-line">{m.mensaje}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.telefonosDestino.join(', ')}
                  </p>
                </dl>
              </div>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden sm:block bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Fecha
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Emisor
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Campaña
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Cultivo
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Mensaje
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Destinatarios
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => goToDetail(m.id)}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm text-foreground">{fmtFechaHora(m.fecha)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <User className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm text-foreground truncate">
                              {m.nombreEmisor || m.emailEmisor || '—'}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              {m.emailEmisor || '—'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">{m.campania}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Sprout className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm text-foreground truncate">
                            {m.cultivo?.nombre || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[280px]">
                        <span className="block text-sm text-foreground truncate" title={m.mensaje}>
                          {m.mensaje}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <span
                          className="block text-sm text-foreground truncate"
                          title={m.telefonosDestino.join(', ')}
                        >
                          {m.telefonosDestino.join(', ')}
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
