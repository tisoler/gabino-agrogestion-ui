import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { Loader2 } from 'lucide-react'

export default function ProtectedRoute() {
  const { firebaseUser, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3 text-muted-foreground">
        <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
        <span className="text-sm font-medium">Cargando Gabino...</span>
      </div>
    )
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
