import { MapContainer, TileLayer, Polyline, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { TrackPoint } from '../api/client'

/** Карта одного заезда. Вынесена отдельно, чтобы leaflet грузился лениво. */
export default function TrackMap({ points, distance }: { points: TrackPoint[]; distance: number }) {
  const positions = points.map((p) => [p.lat, p.lng] as [number, number])
  return (
    <MapContainer bounds={positions} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Polyline positions={positions} color="#3d8fdd" weight={4} opacity={0.85}>
        <Tooltip sticky>Длина: {distance.toFixed(2)} км</Tooltip>
      </Polyline>
    </MapContainer>
  )
}
