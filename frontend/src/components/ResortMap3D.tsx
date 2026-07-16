import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Точечная 3D-модель горы: рельеф — облако точек из открытых DEM-тайлов
 * (AWS Terrain Tiles, формат terrarium), поверх — трассы и подъёмники из
 * OpenStreetMap (Overpass API). Вращение/зум — OrbitControls.
 */

type Props = {
  /** Центр области (обычно средняя точка высот курорта) */
  lat: number
  lng: number
}

// Полуразмер области вокруг центра, градусы (~5-6 км)
const HALF_DEG = 0.055
// Плотность облака точек
const GRID = 150
// Вертикальное преувеличение рельефа
const Z_EXAGGERATION = 1.35

const DIFFICULTY_COLORS: Record<string, string> = {
  novice: '#22c55e',
  easy: '#22c55e',
  intermediate: '#38bdf8',
  advanced: '#ef4444',
  expert: '#a1a1aa', // «чёрная» трасса — серым: чёрное невидимо на тёмном фоне
  freeride: '#a78bfa',
}
const LIFT_COLOR = '#fbbf24'

type OsmWay = {
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
}

/** Трассы и подъёмники из OSM с кэшем в localStorage (Overpass бывает медленным) */
async function fetchOsmWays(lat: number, lng: number): Promise<OsmWay[]> {
  const key = `osm-pistes-${lat.toFixed(3)}-${lng.toFixed(3)}`
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null') as { ts: number; ways: OsmWay[] } | null
    if (cached && Date.now() - cached.ts < 7 * 24 * 3600 * 1000) return cached.ways
  } catch { /* битый кэш — перезапросим */ }

  const bbox = `${lat - HALF_DEG},${lng - HALF_DEG},${lat + HALF_DEG},${lng + HALF_DEG}`
  const query = `[out:json][timeout:25];(way["piste:type"="downhill"](${bbox});way["aerialway"](${bbox}););out geom;`
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query })
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  const data = (await res.json()) as { elements: OsmWay[] }
  const ways = data.elements.filter((w) => w.geometry?.length)
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), ways }))
  } catch { /* переполнен localStorage — живём без кэша */ }
  return ways
}

/** Склеивает DEM-тайлы области в один canvas и возвращает функцию высоты (м) по lat/lng */
async function buildElevationSampler(lat: number, lng: number) {
  const z = 12
  const n = 2 ** z
  const lngToWx = (lon: number) => ((lon + 180) / 360) * n
  const latToWy = (la: number) => {
    const rad = (la * Math.PI) / 180
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  }

  const x0 = Math.floor(lngToWx(lng - HALF_DEG))
  const x1 = Math.floor(lngToWx(lng + HALF_DEG))
  const y0 = Math.floor(latToWy(lat + HALF_DEG))
  const y1 = Math.floor(latToWy(lat - HALF_DEG))

  const canvas = document.createElement('canvas')
  canvas.width = (x1 - x0 + 1) * 256
  canvas.height = (y1 - y0 + 1) * 256
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  await Promise.all(
    Array.from({ length: (x1 - x0 + 1) * (y1 - y0 + 1) }, (_, i) => {
      const tx = x0 + (i % (x1 - x0 + 1))
      const ty = y0 + Math.floor(i / (x1 - x0 + 1))
      return new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          ctx.drawImage(img, (tx - x0) * 256, (ty - y0) * 256)
          resolve()
        }
        img.onerror = () => reject(new Error('DEM tile load failed'))
        img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`
      })
    })
  )

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  return (la: number, lo: number): number => {
    const px = Math.min(canvas.width - 1, Math.max(0, Math.round((lngToWx(lo) - x0) * 256)))
    const py = Math.min(canvas.height - 1, Math.max(0, Math.round((latToWy(la) - y0) * 256)))
    const i = (py * canvas.width + px) * 4
    // terrarium: высота = R*256 + G + B/256 - 32768
    return pixels[i] * 256 + pixels[i + 1] + pixels[i + 2] / 256 - 32768
  }
}

export default function ResortMap3D({ lat, lng }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [trailsLoaded, setTrailsLoaded] = useState(true)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let disposed = false
    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let frameId = 0

    const metersX = (lo: number) => (lo - lng) * 111320 * Math.cos((lat * Math.PI) / 180)
    const metersZ = (la: number) => (lat - la) * 110540

    const build = async () => {
      const elevation = await buildElevationSampler(lat, lng)
      if (disposed) return

      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#0c1222')

      // --- Облако точек рельефа ---
      const positions = new Float32Array(GRID * GRID * 3)
      const colors = new Float32Array(GRID * GRID * 3)
      let minE = Infinity
      let maxE = -Infinity
      const elevGrid: number[] = []
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          const la = lat - HALF_DEG + (2 * HALF_DEG * j) / (GRID - 1)
          const lo = lng - HALF_DEG + (2 * HALF_DEG * i) / (GRID - 1)
          const e = elevation(la, lo)
          elevGrid.push(e)
          if (e < minE) minE = e
          if (e > maxE) maxE = e
        }
      }
      const low = new THREE.Color('#33415e')
      const high = new THREE.Color('#f8fafc')
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          const idx = j * GRID + i
          const la = lat - HALF_DEG + (2 * HALF_DEG * j) / (GRID - 1)
          const lo = lng - HALF_DEG + (2 * HALF_DEG * i) / (GRID - 1)
          const e = elevGrid[idx]
          positions[idx * 3] = metersX(lo)
          positions[idx * 3 + 1] = (e - minE) * Z_EXAGGERATION
          positions[idx * 3 + 2] = metersZ(la)
          const c = low.clone().lerp(high, (e - minE) / Math.max(1, maxE - minE))
          colors[idx * 3] = c.r
          colors[idx * 3 + 1] = c.g
          colors[idx * 3 + 2] = c.b
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      const extent = 2 * HALF_DEG * 111320
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: (extent / GRID) * 1.1, vertexColors: true })))

      // --- Трассы и подъёмники ---
      try {
        const ways = await fetchOsmWays(lat, lng)
        if (disposed) return
        for (const way of ways) {
          if (!way.geometry) continue
          const pts = way.geometry.map((g) => new THREE.Vector3(
            metersX(g.lon),
            (elevation(g.lat, g.lon) - minE) * Z_EXAGGERATION + 25, // чуть выше точек рельефа
            metersZ(g.lat),
          ))
          if (pts.length < 2) continue
          const isLift = !!way.tags?.aerialway
          const color = isLift ? LIFT_COLOR : DIFFICULTY_COLORS[way.tags?.['piste:difficulty'] ?? ''] ?? '#38bdf8'
          const lineGeo = new THREE.BufferGeometry().setFromPoints(pts)
          scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color, linewidth: 2 })))
        }
      } catch {
        setTrailsLoaded(false) // рельеф показываем и без трасс
      }
      if (disposed) return

      // --- Камера, рендер, управление ---
      const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 10, extent * 10)
      camera.position.set(0, (maxE - minE) * Z_EXAGGERATION + extent * 0.35, extent * 0.75)

      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(mount.clientWidth, mount.clientHeight)
      mount.appendChild(renderer.domElement)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, (maxE - minE) * Z_EXAGGERATION * 0.35, 0)
      controls.enableDamping = true
      controls.maxDistance = extent * 2
      controls.minDistance = extent * 0.1
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.6
      // Первое взаимодействие выключает автовращение
      controls.addEventListener('start', () => { controls!.autoRotate = false })

      const onResize = () => {
        if (!renderer) return
        camera.aspect = mount.clientWidth / mount.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(mount.clientWidth, mount.clientHeight)
      }
      window.addEventListener('resize', onResize)

      const animate = () => {
        frameId = requestAnimationFrame(animate)
        controls!.update()
        renderer!.render(scene, camera)
      }
      animate()
      setStatus('ready')

      return () => window.removeEventListener('resize', onResize)
    }

    let cleanupResize: (() => void) | undefined
    build()
      .then((c) => { cleanupResize = c ?? undefined })
      .catch(() => { if (!disposed) setStatus('error') })

    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      cleanupResize?.()
      controls?.dispose()
      if (renderer) {
        renderer.dispose()
        renderer.domElement.remove()
      }
    }
  }, [lat, lng])

  if (status === 'error') {
    return <div className="empty-state"><p>Не удалось загрузить данные рельефа. Попробуйте позже.</p></div>
  }

  return (
    <div className="map3d-wrap">
      {status === 'loading' && <div className="loading map3d-loading">Строим гору из точек...</div>}
      <div ref={mountRef} className="map3d-canvas" />
      {status === 'ready' && (
        <>
          <div className="map3d-legend">
            <span><i style={{ background: '#22c55e' }} /> Зелёные</span>
            <span><i style={{ background: '#38bdf8' }} /> Синие</span>
            <span><i style={{ background: '#ef4444' }} /> Красные</span>
            <span><i style={{ background: '#a1a1aa' }} /> Чёрные</span>
            <span><i style={{ background: '#fbbf24' }} /> Подъёмники</span>
          </div>
          <p className="map3d-hint">
            Вращайте мышью, зум — колесом{!trailsLoaded && ' · трассы не загрузились, показан только рельеф'}
          </p>
        </>
      )}
    </div>
  )
}
