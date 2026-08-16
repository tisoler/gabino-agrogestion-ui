import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  /** Si no hay selección y hay opciones, selecciona la primera (tras el orden). */
  defaultFirst?: boolean
  /** Mensaje cuando el buscador no encuentra resultados. */
  emptyMessage?: string
  /** Clases extra para el contenedor raíz (p.ej. flex-1 dentro de una fila). */
  className?: string
  /** Muestra una "X" para limpiar la selección (llama a onChange('')). */
  clearable?: boolean
  /** Etiqueta opcional junto a cada opción (p.ej. la categoría del insumo). */
  renderTag?: (option: SelectAutocompleteOption) => ReactNode
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
  defaultFirst = false,
  emptyMessage = 'Sin resultados',
  className,
  clearable = false,
  renderTag,
}: SelectAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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
    } else if (defaultFirst && sorted.length > 0 && value === '' && value !== sorted[0].value) {
      onChange(sorted[0].value)
    }
  }, [autoSelectSingle, defaultFirst, sorted, value, onChange])

  // Cerrar al hacer click afuera (incluye el dropdown renderizado en portal).
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Reposiciona el dropdown (portal fixed) ante scroll/resize del documento,
  // para que quede pegado al trigger.
  useEffect(() => {
    if (!open) return
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const toggle = () => {
    if (disabled) return
    if (!open) {
      const el = triggerRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        setPos({ top: r.bottom + 4, left: r.left, width: r.width })
      }
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  const select = (v: string | number) => {
    onChange(v)
    setOpen(false)
    setSearch('')
  }

  const selected = sorted.find((o) => o.value === value)

  const dropdown = open && !disabled && pos
    ? createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-card border border-border rounded-md shadow-lg overflow-hidden"
        >
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
                    onClick={() => select(o.value)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${isSelected
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{o.label}</span>
                      {renderTag && renderTag(o)}
                    </span>
                    {isSelected && <Check className="size-4 shrink-0" strokeWidth={2} />}
                  </button>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={rootRef} className={`space-y-1.5 relative ${className ?? ''}`}>
      {label && <label className="text-xs font-medium text-foreground">{label}</label>}
      <div
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            toggle()
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
                select('')
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
      {dropdown}
    </div>
  )
}
