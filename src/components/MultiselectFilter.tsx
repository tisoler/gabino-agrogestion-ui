import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown } from 'lucide-react'

interface MultiselectOption {
  value: string
  label: string
}

interface MultiselectFilterProps {
  value: string[]
  opciones: MultiselectOption[]
  onChange: (next: string[]) => void
  /** Texto cuando no hay nada seleccionado (ej: "Todos los campos"). */
  placeholder: string
  /** Etiqueta singular para el resumen con conteo (ej: "campo"). */
  etiqueta: string
  /** Texto cuando la lista de opciones está vacía. */
  vacio?: string
  widthCls?: string
}

/**
 * Selector múltiple con checkboxes y "Limpiar filtro". Diseño unificado usado
 * en Lotes (campos), Producción (productor/campaña) y Prescripciones (campaña).
 */
export default function MultiselectFilter({
  value,
  opciones,
  onChange,
  placeholder,
  etiqueta,
  vacio = 'Sin opciones.',
  widthCls = 'w-full',
}: MultiselectFilterProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (c: string) => {
    onChange(value.includes(c) ? value.filter((v) => v !== c) : [...value, c])
  }

  const resumen =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? opciones.find((o) => o.value === value[0])?.label ?? value[0]
        : `${value.length} ${etiqueta}s`

  return (
    <div ref={ref} className={`relative ${widthCls}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors cursor-pointer"
      >
        <span className={`truncate ${value.length ? '' : 'text-muted-foreground'}`}>{resumen}</span>
        <ChevronDown
          className={`size-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-card border border-border rounded-md shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto divide-y divide-border">
            {opciones.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors"
              >
                <span
                  className={`size-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    value.includes(o.value)
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border bg-background'
                  }`}
                >
                  {value.includes(o.value) && <Check className="size-3" strokeWidth={2.5} />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
          {opciones.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">{vacio}</p>
          )}
          {value.length > 0 && (
            <div className="px-3 py-2 border-t border-border bg-muted/30">
              <button
                type="button"
                onClick={() => onChange([])}
                className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpiar filtro
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
