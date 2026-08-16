import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react'
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
import { AuthContext, type User } from './auth-context'

const STORAGE_KEY = 'currentEmpresaId'

const readStoredEmpresaId = (): number | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [permisos, setPermisos] = useState<string[]>([])
  const [currentEmpresaId, setCurrentEmpresaIdState] = useState<number | null>(
    () => readStoredEmpresaId()
  )

  const isSysAdmin = user?.roles?.includes(Roles.SYS_ADMIN) || false
  const isAsesor = user?.roles?.includes(Roles.ASESOR) || false
  const isAsesorAdmin = user?.roles?.includes(Roles.ASESOR_ADMIN) || false
  const isProductor = user?.roles?.includes(Roles.PRODUCTOR) || false
  const isAdmin = isSysAdmin || isAsesorAdmin

  // Empresas visibles para el usuario (sys-admin y asesor-admin: todas;
  // resto: sus idEmpresas)
  const { data: listadoEmpresas, isLoading: isLoadingEmpresas } = useSWR<{ id: number; nombre: string }[]>(
    user ? '/empresas' : null,
    fetcher
  )

  const empresasVisibles = useMemo<number[]>(() => {
    if (!user) return []
    if (isAdmin) {
      return (listadoEmpresas || []).map((e) => e.id)
    }
    return (user.idEmpresas || []).map((e) => Number(e)).filter((n) => Number.isFinite(n) && n > 0)
  }, [user, isAdmin, listadoEmpresas])

  // Sincroniza currentEmpresaId con la lista de empresas válidas del usuario.
  // - Si no hay ninguna en localStorage, toma la primera de idEmpresas (asesor/productor) o null (sys-admin).
  // - Si la guardada no está en la lista visible, la reemplaza.
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidrata estado desde localStorage (sistema externo)
      setCurrentEmpresaIdState(null)
      return
    }

    if (isAdmin) {
      // sys-admin y asesor-admin no usan empresa actual: la UI trabaja con la admin-toggle.
      setCurrentEmpresaIdState(null)
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* noop */
      }
      return
    }

    const visibles = empresasVisibles

    if (visibles.length === 0) {
      setCurrentEmpresaIdState(null)
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* noop */
      }
      return
    }

    const stored = readStoredEmpresaId()
    if (stored && visibles.includes(stored)) {
      setCurrentEmpresaIdState(stored)
    } else {
      setCurrentEmpresaIdState(visibles[0])
    }
  }, [user, isAdmin, empresasVisibles])

  const currentEmpresa = useMemo(() => {
    if (currentEmpresaId && listadoEmpresas) {
      const e = listadoEmpresas.find((emp) => emp.id === currentEmpresaId)
      if (e) return e.nombre
    }
    return null
  }, [currentEmpresaId, listadoEmpresas])

  const navigate = useNavigate()

  const fetchUserProfile = useCallback(async () => {
    try {
      const response = await api.get('/auth/me')
      const userData = response.data
      setUser({
        id: userData.id,
        nombreUsuario: userData.nombreUsuario,
        email: userData.email,
        idEmpresas: Array.isArray(userData.idEmpresas)
          ? userData.idEmpresas.map((e: unknown) => Number(e)).filter((n: number) => Number.isFinite(n) && n > 0)
          : [],
        roles: userData.roles || [],
        permisos: userData.permisos || [],
      })
      setPermisos(userData.permisos || [])
    } catch (error) {
      console.error('Error obteniendo perfil del backend', error)
      setUser(null)
      setPermisos([])
    }
  }, [])

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
        setCurrentEmpresaIdState(null)
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch {
          /* noop */
        }
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [fetchUserProfile])

  const setCurrentEmpresaId = (id: number | null) => {
    if (id === null) {
      setCurrentEmpresaIdState(null)
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* noop */
      }
      return
    }
    if (!empresasVisibles.includes(id)) return
    setCurrentEmpresaIdState(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, id.toString())
    } catch {
      /* noop */
    }
  }

  const logout = async () => {
    await signOut(auth)
    setUser(null)
    setFirebaseUser(null)
    setPermisos([])
    setCurrentEmpresaIdState(null)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* noop */
    }
    navigate('/login')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        permisos,
        loading,
        currentEmpresaId,
        currentEmpresa,
        isSysAdmin,
        isAsesor,
        isAsesorAdmin,
        isProductor,
        empresas: listadoEmpresas || [],
        isLoadingEmpresas,
        setCurrentEmpresaId,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
