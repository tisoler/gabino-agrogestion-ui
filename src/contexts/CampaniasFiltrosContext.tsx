import { useMemo, useState, type ReactNode } from 'react'
import {
  CampaniasFiltrosContext,
  type CampaniasFiltros,
} from './campanias-filtros-context'

const filtrosVacios: CampaniasFiltros = {
  empresaIds: [],
  campanias: [],
  campoIds: [],
  loteIds: [],
  cultivoIds: [],
  variedadIds: [],
}

/**
 * Conserva los filtros del listado de producciones mientras se navega entre
 * vistas (detalle, nueva, etc.). Vive en el Layout, que no se desmonta al
 * cambiar de ruta dentro de la zona protegida. Se reinicia al salir/entrar
 * (el Layout se desmonta al ir a /login).
 */
export function CampaniasFiltrosProvider({ children }: { children: ReactNode }) {
  const [filtros, setFiltrosState] = useState<CampaniasFiltros>(filtrosVacios)

  const value = useMemo(
    () => ({
      filtros,
      setFiltros: (patch: Partial<CampaniasFiltros>) =>
        setFiltrosState((prev) => ({ ...prev, ...patch })),
      resetFiltros: () => setFiltrosState(filtrosVacios),
    }),
    [filtros],
  )

  return (
    <CampaniasFiltrosContext.Provider value={value}>
      {children}
    </CampaniasFiltrosContext.Provider>
  )
}
