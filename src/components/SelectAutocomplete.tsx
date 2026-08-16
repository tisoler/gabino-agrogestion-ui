import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

export interface SelectAutocompleteOption {
  value: string | number
  label: string
}

/** Orden de las opciones. Por ahora solo alfabético, con sentido asc/desc. */
export interface SelectAutocompleteSort {
  by: 'alfabetico'
  direction: 'asc' | 'desc'
}

interface SelectAutocompleteProps {
  label?: string
  placeholder?: string
  value: string | number | ''
  onChange: (value: string | number) => void
  options: SelectAutocompleteOption[]
  disabled?: boolean
  /** Orden de las opciones. Default: alfabetico asc. */
  sort?: SelectAutocompleteSort
  /** Si hay una única opción y no hay selección, la selecciona automáticamente
   *  (esto puede encadenar la siguiente selección de la cascada). */
  autoSelectSingle?: boolean
  /** Mensaje cuando el buscador no encuentra resultados. */
  emptyMessage?: string
  /** Clases extra para el contenedor raíz (p.ej. flex-1 dentro de una fila). */
  className?: string
  /** Muestra una "X" para limpiar la selección (llama a onChange('')). */
  clearable?: boolean
}

const DEFAULT_SORT: SelectAutocompleteSort = { by: 'alfabetico', direction: 'asc' }

export default function SelectAutocomplete({
  label,
  placeholder = 'Seleccionar...',
  value,
  onChange,
  options,
  disabled,
  sort = DEFAULT_SORT,
  autoSelectSingle = false,
  emptyMessage = 'Sin resultados',
  className,
  clearable = false,
}: SelectAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    const dir = sort.direction === 'desc' ? -1 : 1
    return [...options].sort((a, b) => a.label.localeCompare(b.label, 'es') * dir)
  }, [options, sort.direction])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((o) => o.label.toLowerCase().includes(q))
  }, [sorted, search])

  // Auto-selección cuando hay una sola opción.
  useEffect(() => {
    if (autoSelectSingle && sorted.length === 1 && value !== sorted[0].value) {
      onChange(sorted[0].value)
    }
  }, [autoSelectSingle, sorted, value, onChange])

  // Cerrar al hacer click afuera.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const selected = sorted.find((o) => o.value === value)

  return (
    <div ref={rootRef} className={`space-y-1.5 relative ${className ?? ''}`}>
      {label && <label className="text-xs font-medium text-foreground">{label}</label>}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border rounded-md text-sm text-left focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        <span className={`truncate ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          {clearable && selected && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
                setOpen(false)
                setSearch('')
              }}
              aria-label="Limpiar selección"
              className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
            >
              <X className="size-3.5" strokeWidth={2} />
            </span>
          )}
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            strokeWidth={1.75}
          />
        </span>
      </div>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-card border border-border rounded-md shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border">
            <Search className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
              }}
              placeholder="Buscar..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
              filtered.map((o) => {
                const isSelected = o.value === value
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value)
                      setOpen(false)
                      setSearch('')
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${isSelected
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSelected && <Check className="size-4 shrink-0" strokeWidth={2} />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
