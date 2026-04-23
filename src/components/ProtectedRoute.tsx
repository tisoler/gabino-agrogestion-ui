import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute() {
  const { firebaseUser, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <span>Cargando proyecto Gabino...</span>
        <style>{`
          .loading-screen {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: var(--background-alt);
            color: var(--primary-color);
            gap: 16px;
            font-weight: 600;
          }
          .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid var(--primary-color);
            border-bottom-color: transparent;
            border-radius: 50%;
            animation: rotation 1s linear infinite;
          }
          @keyframes rotation {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
