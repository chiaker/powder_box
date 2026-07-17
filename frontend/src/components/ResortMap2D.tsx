import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * 2D-карта курорта: базовый слой OpenStreetMap + слой трасс и подъёмников
 * OpenSnowMap (единый «лыжный» стиль для всех курортов мира).
 */

type LatLng = { lat: number; lng: number }

export default function ResortMap2D({ points }: { points: LatLng[] }) {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const pad = 0.02
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lats) - pad, Math.min(...lngs) - pad],
    [Math.max(...lats) + pad, Math.max(...lngs) + pad],
  ]

  return (
    <MapContainer bounds={bounds} className="map3d-canvas" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <TileLayer
        attribution='&copy; <a href="https://opensnowmap.org">OpenSnowMap</a>'
        url="https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png"
      />
    </MapContainer>
  )
}
