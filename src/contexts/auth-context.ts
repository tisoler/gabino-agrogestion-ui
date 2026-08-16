import { createContext, useContext } from 'react'
import type { User as FirebaseUser } from 'firebase/auth'

export interface Empresa {
  id: number
  nombre: string
}

export interface User {
  id: string
  nombreUsuario: string
  email?: string | null
  idEmpresas: number[]
  roles: string[]
  permisos: string[]
}

export interface AuthContextType {
  user: User | null
  firebaseUser: FirebaseUser | null
  loading: boolean
  permisos: string[]
  currentEmpresaId: number | null
  currentEmpresa: string | null
  isSysAdmin: boolean
  isAsesor: boolean
  isAsesorAdmin: boolean
  isProductor: boolean
  empresas: Empresa[]
  isLoadingEmpresas: boolean
  setCurrentEmpresaId: (id: number | null) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
