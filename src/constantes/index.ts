export const Roles = {
  SYS_ADMIN: 'sys-admin',
  ASESOR: 'asesor',
  ASESOR_ADMIN: 'asesor-admin',
  PRODUCTOR: 'productor',
} as const;

export const ROLES_LABELS: Record<string, string> = {
  [Roles.SYS_ADMIN]: 'Admin',
  [Roles.ASESOR_ADMIN]: 'Asesor admin',
  [Roles.ASESOR]: 'Asesor',
  [Roles.PRODUCTOR]: 'Productor',
};

export function getRoleLabel(roles: string[] | undefined): string {
  if (!roles || roles.length === 0) return ''
  for (const role of roles) {
    if (ROLES_LABELS[role]) return ROLES_LABELS[role]
  }
  return ''
}

/** Unidades de medida admitidas para el precio de insumos y costos. */
export const UNIDADES_PRECIO = ['ton', 'kg', 'lt', 'unidad', 'ha', 'hr'] as const

/**
 * Paleta de colores para las categorías (badges). Las categorías son
 * dinámicas (vienen de la BD), así que se asignan por posición en el listado
 * ordenado alfabéticamente: mientras la lista no mute, cada categoría
 * conserva su color.
 */
export const CATEGORIA_COLORS: string[] = [
  'bg-red-100 text-red-700 border-red-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-yellow-100 text-yellow-700 border-yellow-200',
  'bg-lime-100 text-lime-700 border-lime-200',
  'bg-green-100 text-green-700 border-green-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
  'bg-sky-100 text-sky-700 border-sky-200',
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-stone-100 text-stone-700 border-stone-200',
]

export interface CategoriaConNombre {
  id: number
  nombre: string
}

/**
 * Color estable de una categoría según su posición (alfabética) en el listado.
 * Si la categoría no está en el listado o no tiene id, usa el gris neutro.
 */
export function colorCategoria(
  idCategoria: number | null | undefined,
  categorias: CategoriaConNombre[],
): string {
  if (idCategoria == null) return 'bg-accent text-foreground border-border'
  const sorted = [...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const idx = sorted.findIndex((c) => c.id === idCategoria)
  if (idx < 0) return 'bg-accent text-foreground border-border'
  return CATEGORIA_COLORS[idx % CATEGORIA_COLORS.length]
}
