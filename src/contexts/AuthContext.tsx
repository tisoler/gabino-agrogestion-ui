import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import {
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import api, { fetcher } from '../lib/api'
import { Roles } from '../constantes'

interface Empresa {
  id: number
  nombre: string
}

interface User {
  id: string
  nombreUsuario: string
  idEmpresa: number | null
  idEmpresas: number[] // Para asesores
  nombreEmpresa: string | null
  roles: string[]
  permisos: string[]
}

interface AuthContextType {
  user: User | null
  firebaseUser: FirebaseUser | null
  loading: boolean
  permisos: string[]
  currentEmpresaId: number | null
  currentEmpresa: string | null
  isSysAdmin: boolean
  isAsesor: boolean
  empresas: Empresa[]
  isLoadingEmpresas: boolean
  setCurrentEmpresaId: (id: number | null) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [permisos, setPermisos] = useState<string[]>([])
  const [currentEmpresaId, _setCurrentEmpresaId] = useState<number | null>(() => {
    const saved = localStorage.getItem('currentEmpresaId')
    return saved ? parseInt(saved, 10) : null
  })

  const isSysAdmin = user?.roles?.includes(Roles.SYS_ADMIN) || false
  const isAsesor = user?.roles?.includes(Roles.ASESOR) || false

  // Fetch empresas centralizado para asesores y sys-admin
  const { data: listadoEmpresas, isLoading: isLoadingEmpresas } = useSWR<Empresa[]>(
    user && (isAsesor || isSysAdmin) ? '/empresas' : null,
    fetcher
  )

  // Nombre de la empresa actual derivado del listado o del perfil
  const currentEmpresa = useMemo(() => {
    if (currentEmpresaId && listadoEmpresas) {
      const e = listadoEmpresas.find(emp => emp.id === currentEmpresaId)
      if (e) return e.nombre
    }
    return user?.nombreEmpresa || null
  }, [currentEmpresaId, listadoEmpresas, user])

  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentFirebaseUser) => {
      setLoading(true)
      if (currentFirebaseUser) {
        setFirebaseUser(currentFirebaseUser)
        await fetchUserProfile()
      } else {
        setFirebaseUser(null)
        setUser(null)
        setPermisos([])
        _setCurrentEmpresaId(null)
        localStorage.removeItem('currentEmpresaId')
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const fetchUserProfile = async () => {
    try {
      const response = await api.get('/auth/me')
      const userData = response.data
      setUser(userData)
      setPermisos(userData.permisos || [])

      const isUserSysAdmin = userData.roles?.includes(Roles.SYS_ADMIN)
      const isUserAsesor = userData.roles?.includes(Roles.ASESOR)

      // Lógica de empresa actual según requerimiento
      if (isUserSysAdmin) {
        // sys-admin no usa banner y idEmpresa suele ser null en el backend
        _setCurrentEmpresaId(null)
        localStorage.removeItem('currentEmpresaId')
      } else if (isUserAsesor) {
        // Si ya hay una en localStorage que es válida para el asesor, la dejamos.
        // Si no, asignamos idEmpresa o la primera de idEmpresas.
        const validIds = userData.idEmpresas || []
        if (userData.idEmpresa) validIds.push(userData.idEmpresa)

        if (!currentEmpresaId || !validIds.includes(currentEmpresaId)) {
          const defaultId = userData.idEmpresa || (validIds.length > 0 ? validIds[0] : null)
          if (defaultId && !isNaN(defaultId)) {
            const defaultIdNumber = Number(defaultId)
            _setCurrentEmpresaId(defaultIdNumber)
            localStorage.setItem('currentEmpresaId', defaultIdNumber.toString())
          }
        }
      } else if (userData.idEmpresa) {
        // Usuario común: siempre su idEmpresa
        if (currentEmpresaId !== userData.idEmpresa && !isNaN(userData.idEmpresa)) {
          const idEmpresaNumber = Number(userData.idEmpresa)
          _setCurrentEmpresaId(idEmpresaNumber)
          localStorage.setItem('currentEmpresaId', idEmpresaNumber.toString())
        }
      }
    } catch (error) {
      console.error('Error obteniendo perfil del backend', error)
      setUser(null)
      setPermisos([])
    }
  }

  const setCurrentEmpresaId = (id: number | null) => {
    _setCurrentEmpresaId(id)
    if (id) {
      localStorage.setItem('currentEmpresaId', id.toString())
    } else {
      localStorage.removeItem('currentEmpresaId')
    }
  }

  const logout = async () => {
    await signOut(auth)
    setUser(null)
    setFirebaseUser(null)
    setPermisos([])
    _setCurrentEmpresaId(null)
    localStorage.removeItem('currentEmpresaId')
    navigate('/login')
  }

  return (
    <AuthContext.Provider value={{
      user,
      firebaseUser,
      permisos,
      loading,
      currentEmpresaId,
      currentEmpresa,
      isSysAdmin,
      isAsesor,
      empresas: listadoEmpresas || [],
      isLoadingEmpresas,
      setCurrentEmpresaId,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
