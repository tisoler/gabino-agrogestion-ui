import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Pickaxe,
  Database,
  DollarSign,
  Calendar,
  Users,
  MapPin,
  Sprout,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const { user, logout, permisos } = useAuth()


  const hasPermission = (permission: string) => permisos.includes(permission)

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/labores', label: 'Labores', icon: Pickaxe, permission: 'lectura:labor' },
    { to: '/insumos', label: 'Insumos', icon: Database, permission: 'lectura:insumo' },
    { to: '/costos', label: 'Costos', icon: DollarSign, permission: 'lectura:costo' },
    { to: '/campanias', label: 'Campañas', icon: Calendar, permission: 'lectura:campania' },
    { to: '/productores', label: 'Productores', icon: Users, permission: 'lectura:productor' },
    { to: '/lotes', label: 'Lotes', icon: MapPin, permission: 'lectura:lote' },
    { to: '/cultivos', label: 'Cultivos', icon: Sprout, permission: 'lectura:cultivo' },
  ]

  const activeLink = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${isActive
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    }`

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-sm">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Sprout className="size-8 text-primary shadow-sm rounded-lg p-1 bg-primary/10" />
            <div className="flex flex-col overflow-hidden">
              <span className="font-bold text-sm leading-tight truncate">Gabino</span>
              <span className="text-[10px] text-muted-foreground leading-none">Agrogestión</span>
            </div>
          </div>
        )}
        {isCollapsed && (
          <Sprout className="size-8 text-primary mx-auto" />
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex p-1 rounded-md hover:bg-accent text-muted-foreground transition-colors"
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {navItems.map((item) => (
          (!item.permission || hasPermission(item.permission)) && (
            <NavLink
              key={item.to}
              to={item.to}
              className={activeLink}
              onClick={() => setIsMobileMenuOpen(false)}
              title={isCollapsed ? item.label : ''}
            >
              <item.icon className="size-5 shrink-0" />
              {!isCollapsed && <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>}
            </NavLink>
          )
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-2 bg-accent/30">
        {/* User Info */}
        <div className={`flex items-center gap-3 p-2 rounded-xl bg-card border border-border shadow-xs ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 border border-primary/20">
            {user?.nombreUsuario?.charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-semibold truncate leading-tight">{user?.nombreUsuario?.split('@')[0]}</span>
              <span className="text-[10px] text-muted-foreground truncate leading-none">{user?.nombreEmpresa}</span>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-destructive dark:text-destructive-foreground hover:bg-destructive/10 dark:hover:bg-destructive-foreground/10 transition-all duration-200 font-medium cursor-pointer"
        >
          <LogOut size={18} />
          {!isCollapsed && <span className="text-sm">Cerrar Sesión</span>}
        </button>
      </div>
    </div>
  )


  return (
    <>
      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <Sprout className="size-6 text-primary" />
          <span className="font-bold text-sm">Gabino</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-md hover:bg-accent"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 transition-all duration-300 ease-in-out
          ${isCollapsed ? 'w-16' : 'w-64'}
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <SidebarContent />
      </aside>
    </>
  )
}

