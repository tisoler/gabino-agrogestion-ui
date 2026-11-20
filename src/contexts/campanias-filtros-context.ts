import { createContext, useContext } from 'react'

export interface CampaniasFiltros {
  empresaIds: number[]
  campanias: string[]
  campoIds: number[]
  loteIds: number[]
  cultivoIds: number[]
  variedadIds: number[]
}

export interface CampaniasFiltrosContextType {
  filtros: CampaniasFiltros
  setFiltros: (patch: Partial<CampaniasFiltros>) => void
  resetFiltros: () => void
}

export const CampaniasFiltrosContext = createContext<
  CampaniasFiltrosContextType | undefined
>(undefined)

export function useCampaniasFiltros() {
  const context = useContext(CampaniasFiltrosContext)
  if (context === undefined) {
    throw new Error('useCampaniasFiltros must be used within a CampaniasFiltrosProvider')
  }
  return context
}
