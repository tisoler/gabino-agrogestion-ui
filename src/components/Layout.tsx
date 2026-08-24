import { Sidebar } from './Sidebar'
import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import CotizacionDolar from './CotizacionDolar'
import NotificacionesBell from './NotificacionesBell'

export default function Layout() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      <main
        className={`transition-[padding] duration-200 ease-out pl-0 ${isCollapsed ? 'lg:pl-16' : 'lg:pl-52'
        }`}
      >
        <div className="mx-auto max-w-7xl p-4 md:p-6 pt-16 md:pt-4 min-h-screen">
          <div className="print-hide flex justify-end items-center gap-2 mb-7">
            <NotificacionesBell />
            <CotizacionDolar />
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  )
}