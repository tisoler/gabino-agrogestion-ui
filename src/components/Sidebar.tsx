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
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, type ThemeMode } from '../contexts/ThemeContext'
import { getRoleLabel } from '../constantes'

interface SidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (collapsed: boolean) => void
}

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  permission?: string
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: LucideIcon }[] = [
  { mode: 'light', label: 'Tema claro', icon: Sun },
  { mode: 'dark', label: 'Tema oscuro', icon: Moon },
  { mode: 'system', label: 'Tema del sistema', icon: Monitor },
]

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campanias', label: 'Producción', icon: Calendar, permission: 'lectura:campania' },
  { to: '/prescripciones', label: 'Prescripciones', icon: ClipboardList, permission: 'lectura:prescripcion' },
  { to: '/productores', label: 'Productores', icon: Users, permission: 'lectura:productor' },
  { to: '/lotes', label: 'Lotes', icon: MapPin, permission: 'lectura:lote' },
  { to: '/cultivos', label: 'Cultivos', icon: Sprout, permission: 'lectura:cultivo' },
  { to: '/labores', label: 'Labores', icon: Pickaxe, permission: 'lectura:labor' },
  { to: '/insumos', label: 'Insumos', icon: Database, permission: 'lectura:insumo' },
  { to: '/costos', label: 'Costos', icon: DollarSign, permission: 'lectura:costo' },
]

interface SidebarContentProps extends SidebarProps {
  onCloseMobile?: () => void
}

function SidebarContent({ isCollapsed, setIsCollapsed, onCloseMobile }: SidebarContentProps) {
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const { user, logout, permisos } = useAuth()
  const { mode, setMode } = useTheme()

  const roleLabel = getRoleLabel(user?.roles)

  const hasPermission = (permission: string) => permisos.includes(permission)

  const activeLink = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${isActive
      ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground font-normal'
    }`

  const currentTheme = THEME_OPTIONS.find((opt) => opt.mode === mode) ?? THEME_OPTIONS[2]
  const CurrentThemeIcon = currentTheme.icon

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border relative">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-9 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
              <Sprout className="size-5" strokeWidth={1.75} />
            </div>
            <div className="flex flex-col overflow-hidden leading-tight">
              <span className="text-sm font-semibold tracking-tight truncate">Gabino</span>
              <span className="text-[11px] text-muted-foreground truncate">Agrogestión</span>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="size-9 rounded-md bg-primary-soft text-primary flex items-center justify-center mx-auto">
            <Sprout className="size-5" strokeWidth={1.75} />
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex p-1.5 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          aria-label={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) =>
          (!item.permission || hasPermission(item.permission)) && (
            <NavLink
              key={item.to}
              to={item.to}
              className={activeLink}
              onClick={() => onCloseMobile?.()}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
        )}
      </nav>

      {/* Footer */}
      <div className="p-2.5 border-t border-sidebar-border space-y-1.5">
        {/* Theme switcher */}
        <div className="relative">
          <button
            onClick={() => setIsThemeMenuOpen((v) => !v)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors ${isCollapsed ? 'justify-center' : ''
              }`}
            aria-label="Cambiar tema"
            aria-haspopup="menu"
            aria-expanded={isThemeMenuOpen}
          >
            <CurrentThemeIcon className="size-[18px] shrink-0" strokeWidth={1.75} />
            {!isCollapsed && <span className="truncate">Tema: {currentTheme.label.replace('Tema ', '')}</span>}
          </button>

          {isThemeMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsThemeMenuOpen(false)}
                aria-hidden
              />
              <div
                role="menu"
                className={`absolute z-50 mb-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden ${isCollapsed ? 'left-full ml-2 bottom-0 w-44' : 'left-0 right-0 bottom-full'
                  }`}
              >
                {THEME_OPTIONS.map(({ mode: m, label, icon: Icon }) => (
                  <button
                    key={m}
                    role="menuitemradio"
                    aria-checked={mode === m}
                    onClick={() => {
                      setMode(m)
                      setIsThemeMenuOpen(false)
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${mode === m
                      ? 'bg-primary-soft text-primary font-medium'
                      : 'text-foreground/85 hover:bg-accent'
                      }`}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* User Info */}
        <div
          className={`flex items-center gap-3 p-2 rounded-md bg-card/50 border border-sidebar-border ${isCollapsed ? 'justify-center' : ''
            }`}
        >
          <div className="size-8 rounded-md bg-primary-soft text-primary flex items-center justify-center text-sm font-semibold shrink-0">
            {user?.nombreUsuario?.charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden leading-tight min-w-0">
              <span className="text-sm font-medium truncate">{user?.nombreUsuario?.split('@')[0]}</span>
              {roleLabel && (
                <span className="mt-1 inline-flex self-start text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary-soft rounded-full px-2 py-0.5">
                  {roleLabel}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors ${isCollapsed ? 'justify-center' : ''
            }`}
        >
          <LogOut className="size-[18px] shrink-0" strokeWidth={1.75} />
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </div>
  )
}

export function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const closeMobile = () => setIsMobileMenuOpen(false)

  return (
    <>
      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-primary-soft text-primary flex items-center justify-center">
            <Sprout className="size-5" strokeWidth={1.75} />
          </div>
          <span className="text-sm font-semibold tracking-tight">Gabino</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-md hover:bg-sidebar-accent"
          aria-label="Abrir menú"
        >
          {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-foreground/30 z-40 backdrop-blur-sm"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 transition-[width,transform] duration-200 ease-out
          ${isCollapsed ? 'w-16' : 'w-64'}
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <SidebarContent
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          onCloseMobile={closeMobile}
        />
      </aside>
    </>
  )
}
