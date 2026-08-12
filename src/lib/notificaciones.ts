import { useCallback, useEffect } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import api, { fetcher } from './api'
import { auth } from './firebase'

export interface Notificacion {
  id: number
  idUsuario: string
  tipo: 'produccion' | 'prescripcion'
  mensaje: string
  idCampania: number | null
  idPrescripcion: number | null
  leida: boolean
  createdAt: string
}

export const linkNotificacion = (n: Notificacion): string =>
  n.tipo === 'prescripcion' && n.idPrescripcion != null
    ? `/prescripciones/${n.idPrescripcion}`
    : `/campanias/${n.idCampania ?? ''}`

export function useNotificaciones() {
  return useSWR<Notificacion[]>('/notificaciones', fetcher, {
    refreshInterval: 60_000,
  })
}

export function useNoLeidas() {
  return useSWR<{ noLeidas: number }>('/notificaciones/no-leidas', fetcher, {
    refreshInterval: 60_000,
  })
}

export async function marcarTodasLeidas() {
  return api.post('/notificaciones/marcar-todas-leidas')
}

export async function marcarLeida(id: number) {
  return api.post(`/notificaciones/${id}/leer`)
}

/**
 * Acciones sobre notificaciones con actualización optimista: la UI refleja el
 * cambio al instante y después se reconcilia con el servidor.
 */
export function useNotificacionesActions() {
  const { mutate } = useSWRConfig()

  const marcarLeidaOptimista = useCallback(
    async (id: number) => {
      mutate(
        '/notificaciones',
        (lista: Notificacion[] | undefined) =>
          lista?.map((n) => (n.id === id ? { ...n, leida: true } : n)),
        { revalidate: false },
      )
      mutate(
        '/notificaciones/no-leidas',
        (cur: { noLeidas: number } | undefined) =>
          cur && cur.noLeidas > 0 ? { noLeidas: cur.noLeidas - 1 } : cur,
        { revalidate: false },
      )
      try {
        await marcarLeida(id)
      } catch {
        /* noop */
      } finally {
        mutate('/notificaciones')
        mutate('/notificaciones/no-leidas')
      }
    },
    [mutate],
  )

  const marcarTodasOptimista = useCallback(async () => {
    mutate(
      '/notificaciones',
      (lista: Notificacion[] | undefined) => lista?.map((n) => ({ ...n, leida: true })),
      { revalidate: false },
    )
    mutate('/notificaciones/no-leidas', { noLeidas: 0 }, { revalidate: false })
    try {
      await marcarTodasLeidas()
    } catch {
      /* noop */
    } finally {
      mutate('/notificaciones')
      mutate('/notificaciones/no-leidas')
    }
  }, [mutate])

  return { marcarLeida: marcarLeidaOptimista, marcarTodas: marcarTodasOptimista }
}

/** Revalida el cache de producciones y prescripciones (listas y detalles). */
function revalidarVinculados(mutate: ReturnType<typeof useSWRConfig>['mutate']) {
  mutate(
    (key: unknown) =>
      typeof key === 'string'
        ? key.startsWith('/campanias') || key.startsWith('/prescripciones')
        : Array.isArray(key)
          ? key[0] === 'campanias' || key[0] === 'prescripciones'
          : false,
    undefined,
    { revalidate: true },
  )
}

/**
 * Conexión SSE al stream de notificaciones del usuario.
 * - Al llegar una notificación: refresca el listado, el badge y revalida el
 *   cache de campañas/prescripciones (para que el productor vea lo nuevo).
 * - Al marcar todas leídas: refresca el badge/listado.
 *
 * Se monta una sola vez (en el Layout). EventSource reconecta solo, y acá se
 * reintenta además con un token fresco si la sesión venció.
 */
export function useNotificacionesSSE() {
  const { mutate } = useSWRConfig()

  useEffect(() => {
    let es: EventSource | null = null
    let cancelled = false

    const connect = async () => {
      if (cancelled) return
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
        if (!token || cancelled) return
        const url = `${api.defaults.baseURL}/notificaciones/stream?token=${encodeURIComponent(token)}`
        es = new EventSource(url)
        es.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data) as { tipo?: string }
            if (payload?.tipo === 'notificacion' || payload?.tipo === 'leidas') {
              mutate('/notificaciones')
              mutate('/notificaciones/no-leidas')
            }
            if (payload?.tipo === 'notificacion') {
              revalidarVinculados(mutate)
            }
          } catch {
            /* evento no JSON: ignorar */
          }
        }
        es.onerror = () => {
          es?.close()
          if (!cancelled) setTimeout(connect, 5000)
        }
      } catch {
        if (!cancelled) setTimeout(connect, 10_000)
      }
    }

    connect()
    return () => {
      cancelled = true
      es?.close()
    }
  }, [mutate])
}
