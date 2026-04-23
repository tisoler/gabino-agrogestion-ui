import { useState } from 'react'
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
    setCurrentEmpresaId,
    isSysAdmin,
    isAsesor,
    empresas,
    isLoadingEmpresas
  } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  // Req: sys-admin: no mostrar el banner
  if (isSysAdmin) return null;

  const canSwitch = isAsesor

  const handleSelect = (empresa: Empresa) => {
    setCurrentEmpresaId(empresa.id)
    setIsOpen(false)
  }

  return (
    <div className="flex items-center gap-4 px-4 h-12 w-full bg-primary/5 border-b border-primary/10 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <Building2 size={16} className="text-primary shrink-0" />
        <span className="text-xs font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
          {isAsesor ? 'Empresa Actual:' : 'Empresa:'}
        </span>
        <span className="text-sm font-bold text-foreground truncate">{currentEmpresa || 'Ninguna seleccionada'}</span>
      </div>

      {canSwitch && (
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-bold hover:bg-accent transition-all shadow-sm"
          >
            <UserCircle size={14} className="text-primary" />
            <span>Cambiar Empresa</span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
                <div className="p-3 border-b border-border bg-accent/30 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Seleccionar Empresa</span>
                </div>
                <div className="max-h-72 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {isLoadingEmpresas ? (
                    <div className="p-4 text-center text-xs text-muted-foreground italic">Cargando empresas...</div>
                  ) : (
                    <>
                      {empresas.map(e => (
                        <div
                          key={e.id}
                          onClick={() => handleSelect(e)}
                          className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all group ${currentEmpresaId === e.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                        >
                          <span className="text-sm font-bold">{e.nombre}</span>
                          {currentEmpresaId === e.id && <Check size={14} className="shrink-0" />}
                        </div>
                      ))}
                      {empresas.length === 0 && (
                        <div className="p-4 text-center text-xs text-muted-foreground italic">No hay empresas disponibles</div>
                      )}
                    </>
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
