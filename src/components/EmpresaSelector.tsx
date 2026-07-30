import { useState, useMemo } from 'react'
import { Building2, ChevronDown, Check, UserCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface Empresa {
  id: number
  nombre: string
}

export function EmpresaSelector() {
  const {
    currentEmpresaId,
    currentEmpresa,
    isSysAdmin,
    isAsesor,
    empresas,
    isLoadingEmpresas,
    user,
    setCurrentEmpresaId,
  } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  // sys-admin: no usa banner
  if (isSysAdmin) return null

  // Para asesor y productor, sólo pueden elegir entre sus idEmpresas
  const opciones = useMemo<Empresa[]>(() => {
    if (!user) return []
    const visibles = (user.idEmpresas || []).map(Number)
    return empresas.filter((e) => visibles.includes(e.id))
  }, [empresas, user])

  // canSwitch: tiene más de una empresa y puede elegir
  const canSwitch = opciones.length > 1

  // Si el usuario tiene 0 empresas (caso patológico) o 1, mostramos el banner
  // sin botón de switch.
  const label = isAsesor ? 'Empresa actual' : 'Empresa'
  const empresaActual =
    opciones.find((e) => e.id === currentEmpresaId) ??
    (currentEmpresaId ? { id: currentEmpresaId, nombre: currentEmpresa || 'Empresa actual' } : null)

  const handleSelect = (empresa: Empresa) => {
    setCurrentEmpresaId(empresa.id)
    setIsOpen(false)
  }

  return (
    <div className="flex items-center gap-3 px-4 sm:px-6 h-11 w-full bg-card/60 border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <Building2 className="size-4 text-primary shrink-0" strokeWidth={1.75} />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
          {label}:
        </span>
        <span className="text-sm font-medium text-foreground truncate">
          {empresaActual?.nombre || 'Ninguna seleccionada'}
        </span>
      </div>

      {canSwitch && (
        <div className="relative ml-auto">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors"
            aria-haspopup="menu"
            aria-expanded={isOpen}
          >
            <UserCircle className="size-4 text-primary" strokeWidth={1.75} />
            <span>Cambiar empresa</span>
            <ChevronDown
              className={`size-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              strokeWidth={2}
            />
          </button>

          {isOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsOpen(false)}
                aria-hidden
              />
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-64 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50"
              >
                <div className="px-3 py-2 border-b border-border bg-accent/40">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Seleccionar empresa
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto p-1">
                  {isLoadingEmpresas ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">Cargando empresas...</div>
                  ) : opciones.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No hay empresas disponibles
                    </div>
                  ) : (
                    opciones.map((e) => (
                      <button
                        type="button"
                        key={e.id}
                        onClick={() => handleSelect(e)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-sm text-sm transition-colors ${
                          currentEmpresaId === e.id
                            ? 'bg-primary-soft text-primary font-medium'
                            : 'text-foreground hover:bg-accent'
                        }`}
                      >
                        <span className="truncate">{e.nombre}</span>
                        {currentEmpresaId === e.id && <Check className="size-4 shrink-0" strokeWidth={2} />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
