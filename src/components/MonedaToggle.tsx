import type { Moneda } from '../lib/moneda'

interface MonedaToggleProps {
  value: Moneda
  onChange: (m: Moneda) => void
}

/** Toggle Pesos / USD. Por defecto siempre pesos. */
export default function MonedaToggle({ value, onChange }: MonedaToggleProps) {
  return (
    <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
      {([
        ['pesos', '$'],
        ['usd', 'USD'],
      ] as const).map(([m, label]) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          title={m === 'pesos' ? 'Mostrar en pesos' : 'Mostrar en dólares'}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            value === m
              ? 'bg-primary text-primary-foreground'
              : 'bg-accent text-foreground hover:bg-muted'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
