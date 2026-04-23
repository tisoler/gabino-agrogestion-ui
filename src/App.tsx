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

const Dashboard = () => <div className="premium-card"><h1>🏠 Dashboard</h1><p>Bienvenido a Gabino Agrogestión.</p></div>


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
