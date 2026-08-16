import api from './api'

/**
 * Al registrarse, le pedimos al BE que cree el documento `usuarios/{uid}` en
 * Firestore si no existe (rol por defecto + nombre de la cuenta) y que invalide
 * los caches. El BE usa el admin SDK, así que no depende de las reglas de
 * seguridad de Firestore del cliente. Best-effort: si falla, el admin puede
 * crear el documento a mano y el TTL del cache lo resuelve.
 */
export async function asegurarUsuarioFirestore(): Promise<void> {
  try {
    await api.post('/usuarios/bootstrap')
  } catch (err) {
    console.warn('[signup] No se pudo crear el documento del usuario en Firestore:', err)
  }
}
