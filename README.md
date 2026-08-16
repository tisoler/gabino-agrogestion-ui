# Gabino Agrogestión UI

Frontend **React + Vite + TypeScript + Tailwind CSS v4**, mobile-first.

## Comandos

```bash
pnpm install   # instalar dependencias
pnpm run dev   # desarrollo → puerto vite (con proxy a la API)
pnpm build     # tsc -b && vite build
pnpm run lint  # eslint
```

## Variables de entorno (`.env`)

- `VITE_API_URL` — URL del backend (ej. `http://localhost:3063/api`).
- `VITE_FIREBASE_*` — configuración de Firebase (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId).

## Convenciones clave

- **Data fetching**: SWR + instancia axios `api` (`src/lib/api.ts`) que agrega el token de Firebase
  y el header `x-empresa-id`. En las listas pesadas se usa `revalidateOnFocus: false`.
- **Componentes reutilizables** (`src/components/`):
  - `SelectAutocomplete` — select con buscador; dropdown en portal. Props: `sort` (alfabético asc/desc),
    `autoSelectSingle`, `defaultFirst`, `clearable`, `renderTag` (etiqueta por opción, ej. categoría).
  - `MultiselectFilter` — filtro multi-selección con checkboxes (opcional `colorOf`).
  - `MonedaToggle` — toggle Pesos/USD.
  - `DetalleTable` (usado en `CampaniaDetalle`) — tablas editables con columnas por `kind`
    (`select-with-create`, `date`, `text`, `number` con `precision`, `precio-insumo`, `readonly-money`).
- **Colores de categorías**: `colorCategoria` + `CATEGORIA_COLORS` en `src/constantes/index.ts`
  (asignación por posición alfabética; estable mientras la lista no mute).
- **Moneda**: los insumos se guardan en USD. Mostrar en pesos con `fmtPrecioInsumo(valor, moneda, dolarVenta)`
  usando `useCotizacionDolar().venta` (dólar venta).
- **Filtros con cascada**: Campo → Lote (los lotes de un filtro se filtran por el campo seleccionado,
  y la selección se poda a las opciones vigentes, p.ej. `lotesEfectivos`).
- **Impresión**: la prescripción se imprime en media hoja A4 vertical con `membrete.png`/`pie.png`
  (`public/`); los estilos están en `src/index.css` (`.print-prescripcion`, `@page { margin: 0 }`).
