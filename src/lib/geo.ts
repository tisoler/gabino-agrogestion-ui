// Helpers geográficos para la planilla de seguros.

/**
 * Decimal → `33º 31' 47,65''` (formato de la planilla de la aseguradora).
 * Se usa el valor absoluto (todas las coordenadas son S/O).
 */
export function decimalADms(decimal: number): string {
  if (!Number.isFinite(decimal)) return '—'
  const abs = Math.abs(decimal)
  const grados = Math.floor(abs)
  const minutosFloat = (abs - grados) * 60
  const minutos = Math.floor(minutosFloat)
  const segundos = (minutosFloat - minutos) * 60
  const segStr = segundos.toFixed(2).replace('.', ',').padStart(5, '0')
  return `${grados}º ${String(minutos).padStart(2, '0')}' ${segStr}''`
}
