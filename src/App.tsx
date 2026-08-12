import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Insumos from './pages/Insumos'
import Labores from './pages/Labores'
import Costos from './pages/Costos'
import Cultivos from './pages/Cultivos'
import Lotes from './pages/Lotes'
import Productores from './pages/Productores'
import Campanias from './pages/Campanias'
import CampaniaDetalle from './pages/CampaniaDetalle'
import Prescripciones from './pages/Prescripciones'
import PrescripcionNueva from './pages/PrescripcionNueva'
import PrescripcionDetalle from './pages/PrescripcionDetalle'
import Notificaciones from './pages/Notificaciones'

const Dashboard = () => (
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
              <Route path="/productores" element={<Productores />} />
              <Route path="/campanias" element={<Campanias />} />
              <Route path="/campanias/nueva" element={<CampaniaDetalle />} />
              <Route path="/campanias/:id" element={<CampaniaDetalle />} />
              <Route path="/prescripciones" element={<Prescripciones />} />
              <Route path="/prescripciones/nueva" element={<PrescripcionNueva />} />
              <Route path="/prescripciones/:id" element={<PrescripcionDetalle />} />
              <Route path="/notificaciones" element={<Notificaciones />} />
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
