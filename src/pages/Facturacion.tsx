import { useState } from 'react'
import useSWR from 'swr'
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'

interface PrecioCereal {
  cultivo: string
  precioArs: number | null
  precioUsd: number | null
  estimado: boolean
  sinCotizacion: boolean
}

interface ProduccionBalance {
  idCampania: number
  periodo: string
  lote: string
  cultivo: string
  creadoEn: string
  estado: 'pendiente' | 'pagado'
  monto: number
  precioReferencia: number | null
  usoTarifaBase: boolean
  fechaPago: string | null
}

interface DuenoBalance {
  idUsuario: string
  nombre: string
  email: string
  aCobrar: number
  cobrado: number
  producciones: ProduccionBalance[]
}

interface EmpresaBalance {
  idEmpresa: number
  nombre: string
  aCobrar: number
  cobrado: number
  duenos: DuenoBalance[]
}

interface Balance {
  desde: string
  hasta: string
  tarifaBase: number
  fechaPizarra: string | null
  tcBna: number | null
  precios: PrecioCereal[]
  fuentePrecios: string
  resumen: {
    aCobrar: number
    cobrado: number
    total: number
    pendientes: number
    pagados: number
  }
  empresas: EmpresaBalance[]
}

const anioActual = new Date().getFullYear()

const fmtARS = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(Number(n))
    ? '—'
    : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtFecha = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}

const nombreCultivo = (c: string): string =>
  c.charAt(0).toUpperCase() + c.slice(1)

function toggleEnSet<T>(prev: Set<T>, v: T): Set<T> {
  const next = new Set(prev)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}

function TarifaEditor({ valorInicial, onGuardado }: { valorInicial: number; onGuardado: () => void }) {
  const [tarifaValue, setTarifaValue] = useState(String(valorInicial))
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<'ok' | 'error' | null>(null)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    const valor = Number(tarifaValue)
    if (!Number.isFinite(valor) || valor <= 0) {
      setMsg('error')
      return
    }
    setGuardando(true)
    setMsg(null)
    try {
      await api.patch('/facturacion/config', { tarifaBase: valor })
      setMsg('ok')
      onGuardado()
    } catch {
      setMsg('error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
      <label htmlFor="tarifaBase" className="text-xs text-muted-foreground">
        Tarifa base (cultivos sin precio):
      </label>
      <input
        id="tarifaBase"
        type="number"
        min={1}
        step="0.01"
        value={tarifaValue}
        onChange={(e) => { setTarifaValue(e.target.value); setMsg(null) }}
        className="w-32 px-3 py-1.5 rounded-md border border-border bg-input-background text-sm tabular-nums outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={guardando}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {guardando && <Loader2 className="size-3.5 animate-spin" />}
        Guardar
      </button>
      {msg === 'ok' && (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="size-3.5" /> Tarifa actualizada
        </span>
      )}
      {msg === 'error' && (
        <span className="inline-flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3.5" /> Valor inválido o error al guardar
        </span>
      )}
    </form>
  )
}

export default function Facturacion() {
  const { isSysAdmin } = useAuth()
  const [desde, setDesde] = useState(`${anioActual}-01-01`)
  const [hasta, setHasta] = useState(`${anioActual}-12-31`)
  // Sets de colapsados (opt-out): todo arranca expandido.
  const [empresasColapsadas, setEmpresasColapsadas] = useState<Set<number>>(new Set())
  const [duenosColapsados, setDuenosColapsados] = useState<Set<string>>(new Set())
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const swrKey = isSysAdmin ? `/facturacion/balance?desde=${desde}&hasta=${hasta}` : null
  const { data, isLoading, mutate } = useSWR<Balance>(swrKey, fetcher, {
    revalidateOnFocus: false,
  })

  const cambiarEstado = async (p: ProduccionBalance) => {
    const nuevo = p.estado === 'pagado' ? 'pendiente' : 'pagado'
    const confirma = window.confirm(
      nuevo === 'pagado'
        ? `¿Marcar como PAGADA la producción ${p.periodo} (${p.lote}) por ${fmtARS(p.monto)}? Se congela el precio vigente como registro histórico.`
        : `¿Volver a PENDIENTE la producción ${p.periodo} (${p.lote})? Se limpia el registro de pago.`,
    )
    if (!confirma) return
    setPendingId(p.idCampania)
    setError(null)
    try {
      await api.patch(`/facturacion/pagos/${p.idCampania}`, { estado: nuevo })
      await mutate()
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      setError(e?.response?.data?.message || e?.message || 'No se pudo actualizar el estado de pago')
    } finally {
      setPendingId(null)
    }
  }

  const guardarTarifa = () => {
    void mutate()
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Facturación</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Balance de la app: 10% del precio de pizarra por producción (1 quintal aprox), o tarifa base si el cultivo no tiene precio.
        </p>
      </div>

      {/* Filtros por fecha */}
      <section className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="px-3 py-2 rounded-md border border-border bg-input-background text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="px-3 py-2 rounded-md border border-border bg-input-background text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <button
          onClick={() => { setDesde(`${anioActual}-01-01`); setHasta(`${anioActual}-12-31`) }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <CalendarDays className="size-4" strokeWidth={1.75} />
          Año actual
        </button>
      </section>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6 justify-center">
          <Loader2 className="size-4 animate-spin" /> Cargando balance…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive-soft border border-destructive/30 rounded-md px-3 py-2">
          <AlertCircle className="size-4 shrink-0" /> {error}
        </div>
      )}

      {data && (
        <>
          {/* Resumen */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Saldo a cobrar ({data.resumen.pendientes})
              </p>
              <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">{fmtARS(data.resumen.aCobrar)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cobrado ({data.resumen.pagados})
              </p>
              <p className="text-2xl font-semibold tabular-nums text-success mt-1">{fmtARS(data.resumen.cobrado)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">{fmtARS(data.resumen.total)}</p>
            </div>
          </section>

          {/* Pizarra + tarifa */}
          <section className="bg-card border border-border rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Pizarra CAC {data.fechaPizarra ? `del ${data.fechaPizarra}` : '(fecha no informada)'}
              </span>
              {data.tcBna !== null && <span>TC BNA comprador: <strong className="tabular-nums">{fmtARS(data.tcBna)}</strong></span>}
              {data.fuentePrecios !== 'scrape' && (
                <span className="text-warning">Mostrando última cotización guardada (la CAC no respondió).</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {data.precios.map((p) => (
                <span
                  key={p.cultivo}
                  className="inline-flex items-center gap-1.5 text-xs bg-muted/60 border border-border rounded-full px-2.5 py-1"
                >
                  <strong>{nombreCultivo(p.cultivo)}</strong>
                  {p.sinCotizacion ? (
                    <span className="text-muted-foreground">S/C → tarifa base</span>
                  ) : (
                    <span className="tabular-nums">{fmtARS(p.precioArs)}/Tn</span>
                  )}
                  {p.estimado && !p.sinCotizacion && (
                    <span className="text-[10px] font-semibold uppercase text-warning">(E)</span>
                  )}
                </span>
              ))}
            </div>
            <TarifaEditor
              key={data.tarifaBase}
              valorInicial={data.tarifaBase}
              onGuardado={guardarTarifa}
            />
          </section>

          {/* Accordion empresa → dueño → producciones */}
          {data.empresas.length === 0 && (
            <p className="text-sm text-muted-foreground text-center p-8">
              No hay producciones creadas en el rango seleccionado.
            </p>
          )}
          {data.empresas.map((empresa) => {
            const empColapsada = empresasColapsadas.has(empresa.idEmpresa)
            return (
              <section key={empresa.idEmpresa} className="bg-card border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setEmpresasColapsadas((prev) => toggleEnSet(prev, empresa.idEmpresa))}
                  className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer text-left"
                >
                  <Building2 className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <span className="font-medium text-sm text-foreground truncate flex-1">{empresa.nombre}</span>
                  <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums">
                    A cobrar: <strong className="text-foreground">{fmtARS(empresa.aCobrar)}</strong>
                  </span>
                  <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums">
                    Cobrado: <strong className="text-success">{fmtARS(empresa.cobrado)}</strong>
                  </span>
                  {empColapsada ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                </button>
                {!empColapsada && (
                  <div className="border-t border-border divide-y divide-border">
                    {empresa.duenos.map((dueno) => {
                      const key = `${empresa.idEmpresa}:${dueno.idUsuario}`
                      const colapsado = duenosColapsados.has(key)
                      return (
                        <div key={key}>
                          <button
                            onClick={() => setDuenosColapsados((prev) => toggleEnSet(prev, key))}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 pl-6 bg-muted/30 hover:bg-accent/50 transition-colors cursor-pointer text-left"
                          >
                            <User className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                            <span className="text-sm text-foreground truncate flex-1">
                              {dueno.nombre}
                              {dueno.email && (
                                <span className="text-xs text-muted-foreground ml-2">{dueno.email}</span>
                              )}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              A cobrar: <strong className="text-foreground">{fmtARS(dueno.aCobrar)}</strong>
                              {' · '}
                              Cobrado: <strong className="text-success">{fmtARS(dueno.cobrado)}</strong>
                            </span>
                            {colapsado ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                          </button>
                          {!colapsado && (
                            <ul className="divide-y divide-border">
                              {dueno.producciones.map((p) => (
                                <li
                                  key={p.idCampania}
                                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 pl-6 sm:pl-10"
                                >
                                  <div className="min-w-0 flex-1 basis-48">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {p.periodo} · {p.lote}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {p.cultivo} · creada {fmtFecha(p.creadoEn)}
                                      {p.usoTarifaBase ? (
                                        ' · tarifa base'
                                      ) : p.precioReferencia !== null ? (
                                        <> · pizarra <span className="tabular-nums">{fmtARS(p.precioReferencia)}/Tn</span></>
                                      ) : null}
                                      {p.estado === 'pagado' && p.fechaPago && (
                                        <> · pagada {fmtFecha(p.fechaPago)}</>
                                      )}
                                    </p>
                                  </div>
                                  <span className="text-sm font-semibold tabular-nums text-foreground">
                                    {fmtARS(p.monto)}
                                  </span>
                                  <span
                                    className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${p.estado === 'pagado'
                                        ? 'text-success bg-success-soft'
                                        : 'text-warning bg-warning-soft'
                                      }`}
                                  >
                                    {p.estado}
                                  </span>
                                  <button
                                    onClick={() => cambiarEstado(p)}
                                    disabled={pendingId === p.idCampania}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
                                  >
                                    {pendingId === p.idCampania && <Loader2 className="size-3 animate-spin" />}
                                    {p.estado === 'pagado' ? 'Volver a pendiente' : 'Marcar pagado'}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
