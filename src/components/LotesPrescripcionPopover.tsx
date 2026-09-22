import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useSWR from 'swr'
import { Loader2, MapPin } from 'lucide-react'
import { fetcher } from '../lib/api'
import type { Prescripcion } from '../lib/prescripciones'

interface Entrada {
  campo: string | null
  lote: string
}

interface Pos {
  left: number
  top?: number
  bottom?: number
}

const PANEL_W = 320
const PANEL_MAX_H = 240
const MARGEN = 8

function posicionDesde(rect: DOMRect): Pos {
  const left = Math.max(
    MARGEN,
    Math.min(rect.left, window.innerWidth - PANEL_W - MARGEN),
  )
  if (rect.bottom + 4 + PANEL_MAX_H <= window.innerHeight) {
    return { left, top: rect.bottom + 4 }
  }
  return { left, bottom: window.innerHeight - rect.top + 4 }
}

function entradasDe(
  detalle: Prescripcion | undefined,
  fallback: Entrada,
): Entrada[] {
  const filas = (detalle?.lotes ?? []).map((l) => ({
    campo: l.campania?.lote?.campo?.nombre ?? null,
    lote:
      l.campania?.lote?.descripcion?.trim() ||
      (l.campania?.lote ? `Lote #${l.campania.lote.id}` : `Campaña #${l.idCampania}`),
  }))
  return filas.length > 0 ? filas : [fallback]
}

/**
 * Badge "+N" clickeable para celdas de campo/lote con multi-lote.
 * Muestra la primera en la celda y abre un popover (portal fixed, sin
 * recortes por overflow) anclado a la celda con la lista completa:
 * campos en la celda de campo, "campo - lote" en la de lotes.
 * El detalle se carga lazy solo al abrir.
 */
export default function LotesPrescripcionPopover({
  prescripcionId,
  restantes,
  kind,
  fallback,
  className,
  titulo,
}: {
  prescripcionId: number
  /** Cantidad adicional (lotesCount - 1) que muestra el badge. */
  restantes: number
  kind: 'campo' | 'lote'
  /** Primera fila (la visible en la celda), por si el detalle aún no cargó. */
  fallback: Entrada
  className?: string
  titulo?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const { data: detalle, isLoading } = useSWR<Prescripcion>(
    open ? `/prescripciones/${prescripcionId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // Cierra al clickear fuera del trigger y del panel.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open ])

  // Reposiciona el panel ante scroll/resize, pegado a la celda.
  useEffect(() => {
    if (!open) return
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      setPos(posicionDesde(el.getBoundingClientRect()))
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open) {
      const el = triggerRef.current
      if (el) setPos(posicionDesde(el.getBoundingClientRect()))
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  const entradas = entradasDe(detalle, fallback)
  const lineas =
    kind === 'campo'
      ? [...new Map(entradas.map((x) => [x.campo ?? 'Sin campo', null])).keys()]
      : entradas.map((x) => `Campo: ${x.campo ?? 'Sin campo'} - Lote: ${x.lote}`)

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: PANEL_W,
              maxHeight: PANEL_MAX_H,
              zIndex: 9999,
            }}
            className="bg-card border border-border rounded-md shadow-lg overflow-hidden flex flex-col"
          >
            <p className="px-3 py-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {titulo ?? (kind === 'campo' ? 'Campos' : 'Lotes')} · {entradas.length}
            </p>
            <ul className="overflow-y-auto py-1">
              {isLoading && entradas.length <= 1 && !detalle ? (
                <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Cargando…
                </li>
              ) : (
                lineas.map((linea, idx) => (
                  <li
                    key={`${linea}-${idx}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-foreground"
                  >
                    {kind === 'lote' && (
                      <MapPin className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                    )}
                    <span className="min-w-0 flex-1 break-words">{linea}</span>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        title={kind === 'campo' ? 'Ver campos' : 'Ver lotes'}
        className={className ?? 'shrink-0 inline-flex items-center px-2 py-0.5 rounded-md border border-border bg-muted/50 text-[11px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors cursor-pointer'}
      >
        +{restantes}
      </button>
      {panel}
    </>
  )
}
