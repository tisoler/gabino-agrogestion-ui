import { Sidebar } from './Sidebar'
import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import { EmpresaSelector } from './EmpresaSelector'

export default function Layout() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      <main
        className={`transition-[padding] duration-200 ease-out pl-0 ${
          isCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        }`}
      >
        <div className="pt-14 md:pt-0 md:sticky md:top-0 z-40 bg-background/85 backdrop-blur">
          <EmpresaSelector />
        </div>

        <div className="mx-auto max-w-7xl p-4 md:p-8 pt-6 md:pt-8 min-h-screen">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
