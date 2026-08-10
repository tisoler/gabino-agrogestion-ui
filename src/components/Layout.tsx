import { Sidebar } from './Sidebar'
import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import CotizacionDolar from './CotizacionDolar'

export default function Layout() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      <main
        className={`transition-[padding] duration-200 ease-out pl-0 ${isCollapsed ? 'lg:pl-16' : 'lg:pl-64'
          }`}
      >
        <div className="mx-auto max-w-7xl p-4 md:p-8 pt-16 md:pt-4 min-h-screen">
          <div className="flex justify-end mb-7">
            <CotizacionDolar />
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  )
}