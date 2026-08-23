export interface MensajeMasivoListItem {
  id: number
  mensaje: string
  fecha: string
  idUsuarioEmisor: string
  emailEmisor: string | null
  nombreEmisor: string | null
  campania: string
  idCultivo: number | null
  cultivo: { id: number; nombre: string } | null
  telefonosDestino: string[]
  emailsDestino: string[]
}

export type MensajeMasivoDetalle = MensajeMasivoListItem

/** Destinatario resuelto por el BE para un cultivo/período. */
export interface Destinatario {
  uid: string
  nombreUsuario: string
  email: string | null
  celular: string
  empresas: string[]
}

/** Respuesta del POST /mensajes-masivos: registro creado + destinatarios. */
export interface MensajeMasivoCreado extends MensajeMasivoListItem {
  destinatarios: { uid: string; nombreUsuario: string; celular: string }[]
}

/**
 * Token de personalización del mensaje: se reemplaza por el nombre de cada
 * destinatario al abrir su chat (el saludo por defecto ya lo incluye).
 */
export const TOKEN_NOMBRE = 'nombre_usuario'

export const SALUDO_DEFAULT = `Hola ${TOKEN_NOMBRE}, te escribo para informarte.\n`

/** Reemplaza todas las ocurrencias del token por el nombre del destinatario. */
export function personalizar(mensaje: string, nombre: string): string {
  return mensaje.split(TOKEN_NOMBRE).join(nombre)
}

/**
 * Link de chat de WhatsApp con mensaje precargado. El celular se limpia a
 * sólo dígitos (mismo patrón que la vista Productores).
 */
export function waLink(celular: string, texto: string): string {
  return `https://wa.me/${celular.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`
}

export const fmtFechaHora = (fecha: string | undefined | null): string => {
  if (!fecha) return '—'
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return fecha
  return `${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
}
