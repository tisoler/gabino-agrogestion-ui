import { useEffect, useRef } from 'react'
import L from 'leaflet'
import * as turf from '@turf/turf'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import 'leaflet/dist/leaflet.css'

// Mapa satelital gratuito (Esri World Imagery). Sin opción de mapa de calles.
const TILES_SATELITAL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ATRIBUCION = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'

// Overlay de referencia (localidades y límites de países/provincias) sobre el satelital.
const TILES_REFERENCIA =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

// Vista inicial por defecto (Máximo Paz, Santa Fe, Argentina) con zoom amplio.
const DEFAULT_CENTER: [number, number] = [-33.4857, -60.8036]
const DEFAULT_ZOOM = 8

// Límites de provincias de Argentina como capa vectorial (se ven en cualquier
// zoom). Se sirve desde public/ para no depender de terceros.
const LIMITES_PROVINCIAS_URL = '/argentina-provincias.json'

export interface Centroide {
  lat: number
  lng: number
}

interface MapaLoteProps {
  /** En modo dibujo habilita trazar/editar polígonos (Geoman). */
  dibujar?: boolean
  /** Polígono GeoJSON existente para mostrar/editar. */
  geometria?: GeoJSON.GeoJsonObject | null
  /** Centroide (lat/lng) para mostrar como marcador cuando no hay geometría. */
  centroide?: Centroide | null
  onChange?: (geometria: GeoJSON.GeoJsonObject | null, centroide: Centroide | null, areaHa: number) => void
  altura?: string
}

const iconoCentroide = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;border-radius:9999px;background:#0284c7;border:2px solid #fff;box-shadow:0 0 0 2px rgba(2,132,199,.4)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

export default function MapaLote({
  dibujar = false,
  geometria,
  centroide,
  onChange,
  altura = 'h-64',
}: MapaLoteProps) {
  const contRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.Layer | null>(null)
  const onChangeRef = useRef(onChange)
  const internalChangeRef = useRef(false)
  const provinciasRef = useRef<L.GeoJSON | null>(null)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Carga los límites de provincias (vector, visible en cualquier zoom)
  useEffect(() => {
    let activo = true
    fetch(LIMITES_PROVINCIAS_URL)
      .then((r) => r.json())
      .then((geojson) => {
        if (!activo || !mapRef.current) return
        provinciasRef.current = L.geoJSON(geojson, {
          style: {
            color: '#ffffff',
            weight: 1,
            opacity: 0.7,
            fill: false,
          },
          interactive: false,
        })
        provinciasRef.current.addTo(mapRef.current)
      })
      .catch(() => {
        // Si no se pudo cargar, seguimos sin los límites.
      })
    return () => {
      activo = false
      if (provinciasRef.current) {
        provinciasRef.current.remove()
        provinciasRef.current = null
      }
    }
  }, [])

  // Inicializa el mapa una sola vez
  useEffect(() => {
    const el = contRef.current
    if (!el || mapRef.current) return

    const map = L.map(el, { zoomControl: false })
    mapRef.current = map
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer(TILES_SATELITAL, { attribution: ATRIBUCION, maxZoom: 19 }).addTo(map)
    L.tileLayer(TILES_REFERENCIA, { maxZoom: 19 }).addTo(map)
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)

    if (dibujar) {
      map.pm.addControls({
        position: 'topleft',
        drawMarker: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawRectangle: true,
        drawPolygon: true,
        drawCircle: false,
        drawText: false,
        editMode: false,
        dragMode: false,
        cutPolygon: false,
        removalMode: true,
      })
      map.on('pm:create', (e) => reemplazar(e.layer))
      map.on('pm:remove', () => {
        layerRef.current = null
        internalChangeRef.current = true
        onChangeRef.current?.(null, null, 0)
      })
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dibujar])

  // Renderiza la geometría / centroide provistos
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Si el cambio vino del propio mapa (dibujo/edición), no re-renderizar.
    if (internalChangeRef.current) {
      internalChangeRef.current = false
      return
    }

    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }

    if (geometria) {
      const geo = L.geoJSON(geometria, {
        style: { color: '#0284c7', weight: 2, fillColor: '#38bdf8', fillOpacity: 0.25 },
      })
      layerRef.current = geo
      geo.addTo(map)
      map.fitBounds((geo as L.GeoJSON).getBounds(), { padding: [30, 30] })
    } else if (centroide && Number.isFinite(centroide.lat) && Number.isFinite(centroide.lng)) {
      const marker = L.marker([centroide.lat, centroide.lng], { icon: iconoCentroide })
      layerRef.current = marker
      marker.addTo(map)
      map.setView([centroide.lat, centroide.lng], 14)
    }
  }, [geometria, centroide, dibujar])

  const reemplazar = (layer: L.Layer) => {
    if (layerRef.current && layerRef.current !== layer) {
      layerRef.current.remove()
    }
    layerRef.current = layer
    emitir(layer)
  }

  const emitir = (layer: L.Layer) => {
    const poly = layer as L.Polygon
    const feature = poly.toGeoJSON()
    const c = turf.centroid(feature)
    const coords = c.geometry.coordinates // [lng, lat]
    const areaHa = turf.area(feature) / 10000
    internalChangeRef.current = true
    onChangeRef.current?.(feature.geometry, { lat: coords[1], lng: coords[0] }, areaHa)
  }

  return <div ref={contRef} className={`${altura} w-full rounded-md overflow-hidden`} />
}
