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
