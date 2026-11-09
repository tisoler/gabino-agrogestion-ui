import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom'
import useSWR from 'swr'
import { Calendar, MapPin, Binoculars } from 'lucide-react'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/auth-context'
import { fetcher } from './lib/api'
import { fmtFecha } from './lib/prescripciones'
import { ThemeProvider } from './contexts/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Insumos from './pages/Insumos'
import Labores from './pages/Labores'
import Costos from './pages/Costos'
import Cultivos from './pages/Cultivos'
import Lotes from './pages/Lotes'
import LoteDetalle from './pages/LoteDetalle'
import Productores from './pages/Productores'
import Campanias from './pages/Campanias'
import CampaniaDetalle from './pages/CampaniaDetalle'
import Prescripciones from './pages/Prescripciones'
import PrescripcionNueva from './pages/PrescripcionNueva'
import PrescripcionDetalle from './pages/PrescripcionDetalle'
import Monitoreos from './pages/Monitoreos'
import MonitoreoNuevo from './pages/MonitoreoNuevo'
import Notificaciones from './pages/Notificaciones'
import Reportes from './pages/Reportes'
import ReporteResumen from './pages/ReporteResumen'
import ReporteDetalle from './pages/ReporteDetalle'
import ReporteVer from './pages/ReporteVer'
import Configuracion from './pages/Configuracion'
import MensajesMasivos from './pages/MensajesMasivos'
import MensajeMasivoNuevo from './pages/MensajeMasivoNuevo'
import MensajeMasivoDetalle from './pages/MensajeMasivoDetalle'
import AnalisisLote from './pages/AnalisisLote'
import Facturacion from './pages/Facturacion'

interface UltimoMonitoreo {
  id: number
  fecha: string
  hora: string
  estado?: string
  campania?: {
    id: number
    campania?: string
    lote?: { id: number; descripcion: string | null; idEmpresa: number } | null
    cultivo?: { nombre: string } | null
  } | null
}

interface CoberturaItem {
  idLote: number
  lote: string | null
  campo: string | null
  idEmpresa: number
  empresa: string | null
  periodo: string
  ultimoMonitoreo: { id: number; fecha: string; hora: string } | null
  totalMonitoreos: number
}

/**
 * Dashboard del asesor (spike B): últimos monitoreos (fecha+hora, productor,
 * lote, link) ordenados desc, y lotes con monitoreos más lejanos (sin
 * monitoreo primero, luego asc).
 */
const Dashboard = () => {
  const { permisos, empresas } = useAuth()
  const canRead = permisos.includes('lectura:monitoreo-lote')
  const { data: ultimos = [] } = useSWR<UltimoMonitoreo[]>(
    canRead ? '/monitoreos' : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: cobertura = [] } = useSWR<CoberturaItem[]>(
    canRead ? '/monitoreos/cobertura' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const nombreEmpresa = (id?: number, fallback?: string | null) =>
    empresas.find((e) => e.id === id)?.nombre ?? fallback ?? (id != null ? `Productor #${id}` : '—')

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Bienvenido a Gabino Agrogestión.</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Pronto verás aquí los indicadores clave de tu gestión agropecuaria.</p>
        </div>
      </div>
    )
  }

  const ultimos10 = ultimos.slice(0, 10)
  const lejanos10 = cobertura.slice(0, 10)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Últimos monitoreos y lotes por visitar.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Últimos monitoreos</h2>
            <Link to="/monitoreos" className="text-sm font-medium text-primary hover:underline">Ver todos</Link>
          </div>
          {ultimos10.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Todavía no hay monitoreos.</p>
          ) : (
            <ul className="divide-y divide-border">
              {ultimos10.map((m) => (
                <li key={m.id}>
                  <Link
                    to={m.campania ? `/campanias/${m.campania.id}` : '/monitoreos'}
                    className="flex items-center gap-3 py-2 hover:bg-muted/40 rounded px-1 transition-colors"
                  >
                    <Calendar className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">
                        {nombreEmpresa(m.campania?.lote?.idEmpresa)} ·{' '}
                        {m.campania?.lote?.descripcion || (m.campania?.lote ? `Lote #${m.campania.lote.id}` : '—')}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {fmtFecha(m.fecha)} · {m.hora?.slice(0, 5)}
                        {m.estado === 'borrador' ? ' · Borrador' : ''}
                        {m.campania?.campania ? ` · Campaña ${m.campania.campania}` : ''}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Lotes por visitar</h2>
            <Link to="/lotes" className="text-sm font-medium text-primary hover:underline">Ver lotes</Link>
          </div>
          {lejanos10.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin lotes en tu ámbito.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lejanos10.map((l) => (
                <li key={l.idLote}>
                  <Link
                    to={`/lotes/${l.idLote}`}
                    className="flex items-center gap-3 py-2 hover:bg-muted/40 rounded px-1 transition-colors"
                  >
                    {l.ultimoMonitoreo ? (
                      <Calendar className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                    ) : (
                      <Binoculars className="size-4 text-amber-600 shrink-0" strokeWidth={1.75} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">
                        <MapPin className="inline size-3 text-muted-foreground mr-1" strokeWidth={1.75} />
                        {nombreEmpresa(l.idEmpresa, l.empresa)} · {l.lote || `Lote #${l.idLote}`}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {l.campo ?? 'Sin campo'} ·{' '}
                        {l.ultimoMonitoreo
                          ? `último: ${fmtFecha(l.ultimoMonitoreo.fecha)} · ${l.ultimoMonitoreo.hora?.slice(0, 5)}`
                          : 'sin monitoreos'}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}


function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <Routes>

          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="/labores" element={<Labores />} />
              <Route path="/insumos" element={<Insumos />} />
              <Route path="/costos" element={<Costos />} />
              <Route path="/cultivos" element={<Cultivos />} />
              <Route path="/lotes" element={<Lotes />} />
              <Route path="/lotes/nuevo" element={<LoteDetalle />} />
              <Route path="/lotes/:id" element={<LoteDetalle />} />
              <Route path="/analisis" element={<AnalisisLote />} />
              <Route path="/productores" element={<Productores />} />
              <Route path="/campanias" element={<Campanias />} />
              <Route path="/campanias/nueva" element={<CampaniaDetalle />} />
              <Route path="/campanias/:id" element={<CampaniaDetalle />} />
              <Route path="/prescripciones" element={<Prescripciones />} />
              <Route path="/prescripciones/nueva" element={<PrescripcionNueva />} />
              <Route path="/prescripciones/:id" element={<PrescripcionDetalle />} />
              <Route path="/monitoreos" element={<Monitoreos />} />
              <Route path="/monitoreos/nuevo" element={<MonitoreoNuevo />} />
              <Route path="/notificaciones" element={<Notificaciones />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/reportes/resumen" element={<ReporteResumen />} />
              <Route path="/reportes/detalle" element={<ReporteDetalle />} />
              <Route path="/reportes/ver/:id" element={<ReporteVer />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/mensajes-masivos" element={<MensajesMasivos />} />
              <Route path="/mensajes-masivos/nueva" element={<MensajeMasivoNuevo />} />
              <Route path="/mensajes-masivos/:id" element={<MensajeMasivoDetalle />} />
              <Route path="/facturacion" element={<Facturacion />} />
              {/* Add more routes here */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  )
}


export default App
