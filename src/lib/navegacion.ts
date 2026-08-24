import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Vuelve a la vista de lista: si hay una entrada previa dentro de la app hace
 * un go-back (navigate(-1)); si no (acceso directo, primera entrada del
 * router), navega al fallback: la vista de lista correspondiente.
 *
 * Usa `location.key === 'default'` (señal del propio historial de
 * react-router), más fiable que window.history.length, que también cuenta
 * entradas externas a la app.
 */
export function useVolver(fallback: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (location.key !== 'default') {
      navigate(-1)
    } else {
      navigate(fallback, { replace: true })
    }
  }
}