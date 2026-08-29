import api from './api'
import type { AxiosError } from 'axios'

/**
 * Al registrarse, le pedimos al BE que cree el documento `usuarios/{uid}` en
 * Firestore si no existe (rol por defecto + nombre de la cuenta + celular
 * opcional) y que invalide los caches. El BE usa el admin SDK, así que no
 * depende de las reglas de seguridad de Firestore del cliente.
 *
 * Best-effort con reintentos: justo después de crear la cuenta, el ID token
 * recién emitido puede fallar al verificarse por un instante (propagación) o
 * la red puede fallar. Reintentamos los errores transitorios (sin token / 401
 * / 5xx / 429) antes de rendirnos; los 4xx deterministas no se reintentan.
 * Si aun así falla, el admin puede crear el documento a mano y el TTL del
 * cache lo resuelve.
 */
export async function asegurarUsuarioFirestore(celular?: string): Promise<void> {
  const INTENTOS = 3
  const payload = celular ? { celular } : {}
  for (let i = 1; i <= INTENTOS; i++) {
    try {
      await api.post('/usuarios/bootstrap', payload)
      return
    } catch (err) {
      const status = (err as AxiosError)?.response?.status
      // Sin respuesta = error de red; 401 puede ser token recién emitido;
      // 429/5xx son transitorios.
      const transitorio = status === undefined || status === 401 || status === 429 || status >= 500
      if (transitorio && i < INTENTOS) {
        await new Promise((r) => setTimeout(r, 500 * i))
        continue
      }
      console.warn('[signup] No se pudo crear el documento del usuario en Firestore:', err)
      return
    }
  }
}