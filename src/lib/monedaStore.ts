import { useSyncExternalStore } from 'react'

export type Moneda = 'pesos' | 'usd'
export type TipoDolar = 'compra' | 'venta'

interface MonedaState {
  moneda: Moneda
  tipoDolar: TipoDolar | null
}

let state: MonedaState = { moneda: 'pesos', tipoDolar: null }
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function setMonedaGlobal(moneda: Moneda, tipoDolar: TipoDolar | null) {
  state = { moneda, tipoDolar }
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function getSnapshot(): MonedaState {
  return state
}

/** Estado global de moneda para resaltar la cotización en el header. */
export function useMonedaGlobal(): MonedaState {
  return useSyncExternalStore(subscribe, getSnapshot)
}
