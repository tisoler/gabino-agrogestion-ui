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
  'bg-red-300 text-red-950 border-red-400',
  'bg-teal-100 text-teal-800 border-teal-200',
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-indigo-500 text-white border-indigo-600',
  'bg-lime-100 text-lime-800 border-lime-200',
  'bg-violet-300 text-violet-950 border-violet-400',
  'bg-yellow-400 text-yellow-900 border-yellow-500',
  'bg-emerald-500 text-white border-emerald-600',
  'bg-purple-200 text-purple-900 border-purple-300',
  'bg-cyan-300 text-cyan-950 border-cyan-400',
  'bg-green-100 text-green-800 border-green-200',
  'bg-sky-500 text-white border-sky-600',
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

/**
 * Tintes de fondo para agrupar las filas (labor + insumos) que provienen de
 * una misma prescripción. Misma secuencia de matices que CATEGORIA_COLORS,
 * con tonos variados para que las prescripciones contiguas se diferencien.
 * Asignados por posición de la prescripción entre las prescripciones
 * presentes en la producción: estables mientras esas tablas no cambien.
 */
export const PRESCRIPCION_ROW_COLORS: string[] = [
  'bg-red-100 hover:bg-red-200',
  'bg-teal-50 hover:bg-teal-100',
  'bg-amber-100 hover:bg-amber-200',
  'bg-indigo-200 hover:bg-indigo-300',
  'bg-lime-50 hover:bg-lime-100',
  'bg-violet-100 hover:bg-violet-200',
  'bg-yellow-100 hover:bg-yellow-200',
  'bg-emerald-100 hover:bg-emerald-200',
  'bg-purple-200 hover:bg-purple-300',
  'bg-cyan-100 hover:bg-cyan-200',
  'bg-green-50 hover:bg-green-100',
  'bg-sky-100 hover:bg-sky-200',
]

/**
 * Color de fila (background) de una prescripción según su posición entre las
 * prescripciones de la producción. Devuelve '' si no tiene prescripción.
 */
export function colorPrescripcion(
  idPrescripcion: number | null | undefined,
  prescripciones: Array<number | null | undefined>,
): string {
  if (idPrescripcion == null) return ''
  const ids = Array.from(
    new Set(prescripciones.filter((p): p is number => p != null)),
  ).sort((a, b) => a - b)
  const idx = ids.indexOf(idPrescripcion)
  if (idx < 0) return ''
  return PRESCRIPCION_ROW_COLORS[idx % PRESCRIPCION_ROW_COLORS.length]
}
