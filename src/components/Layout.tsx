import { Sidebar } from './Sidebar'
import { Outlet } from 'react-router-dom'
import { useState } from 'react'

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
        <div className="mx-auto max-w-7xl p-4 md:p-8 pt-16 md:pt-8 min-h-screen">
          <Outlet />
        </div>
      </main>
    </div>
  )
}