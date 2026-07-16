import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'

/**
 * Точечная 3D-модель горы: рельеф — облако точек из открытых DEM-тайлов
 * (AWS Terrain Tiles, формат terrarium), поверх — трассы и подъёмники из
 * OpenStreetMap. Область строится по точкам высот курорта; чужие трассы
 * отсекаются по удалённости от них. Наведение подсвечивает трассу и
 * показывает название, высоты и протяжённость.
 */

type LatLng = { lat: number; lng: number }
type Props = {
  /** Точки высот курорта — задают область карты и «свои» трассы */
  points: LatLng[]
}

const GRID = 150
const Z_EXAGGERATION = 1.35
const PAD_DEG = 0.02 // запас области вокруг точек курорта (~2 км)
const MIN_HALF_DEG = 0.03 // минимальный полуразмер области
const NEAR_POINT_M = 2200 // трасса «своя», если проходит ближе к точке курорта

// Европейская схема сложности, как на схемах курортов
const PISTE_STYLE: Record<string, { color: string; label: string; halo?: boolean }> = {
  novice: { color: '#22c55e', label: 'зелёная' },
  easy: { color: '#3b82f6', label: 'синяя' },
  intermediate: { color: '#ef4444', label: 'красная' },
  advanced: { color: '#111827', label: 'чёрная', halo: true },
  expert: { color: '#111827', label: 'чёрная (эксперт)', halo: true },
  freeride: { color: '#a78bfa', label: 'фрирайд' },
}
const DEFAULT_PISTE = { color: '#94a3b8', label: 'без категории', halo: false }
const LIFT_COLOR = '#fbbf24'
const LIFT_LABELS: Record<string, string> = {
  cable_car: 'Канатная дорога',
  gondola: 'Гондола',
  mixed_lift: 'Комби-подъёмник',
  chair_lift: 'Кресельный подъёмник',
  drag_lift: 'Бугельный подъёмник',
  't-bar': 'Бугель',
  platter: 'Тарелочный бугель',
  rope_tow: 'Бэби-лифт',
  magic_carpet: 'Траволатор',
}

type Bbox = { s: number; w: number; n: number; e: number }

type OsmWay = {
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
}

function computeBbox(points: LatLng[]): Bbox {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
  const halfLat = Math.max(MIN_HALF_DEG, (Math.max(...lats) - Math.min(...lats)) / 2 + PAD_DEG)
  const halfLng = Math.max(MIN_HALF_DEG, (Math.max(...lngs) - Math.min(...lngs)) / 2 + PAD_DEG)
  return { s: cLat - halfLat, w: cLng - halfLng, n: cLat + halfLat, e: cLng + halfLng }
}

/** Трассы и подъёмники из OSM с кэшем в localStorage (Overpass бывает медленным) */
async function fetchOsmWays(bbox: Bbox): Promise<OsmWay[]> {
  const key = `osm-pistes-${bbox.s.toFixed(3)}-${bbox.w.toFixed(3)}-${bbox.n.toFixed(3)}-${bbox.e.toFixed(3)}`
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null') as { ts: number; ways: OsmWay[] } | null
    if (cached && Date.now() - cached.ts < 7 * 24 * 3600 * 1000) return cached.ways
  } catch { /* битый кэш — перезапросим */ }

  const bb = `${bbox.s},${bbox.w},${bbox.n},${bbox.e}`
  const query = `[out:json][timeout:25];(way["piste:type"="downhill"](${bb});way["aerialway"](${bb}););out geom;`
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
async function buildElevationSampler(bbox: Bbox) {
  const z = 12
  const n = 2 ** z
  const lngToWx = (lon: number) => ((lon + 180) / 360) * n
  const latToWy = (la: number) => {
    const rad = (la * Math.PI) / 180
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  }

  const x0 = Math.floor(lngToWx(bbox.w))
  const x1 = Math.floor(lngToWx(bbox.e))
  const y0 = Math.floor(latToWy(bbox.n))
  const y1 = Math.floor(latToWy(bbox.s))

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

type WayRecord = {
  materials: LineMaterial[]
  baseColor: THREE.Color
  baseWidth: number
  title: string
  subtitle: string
  topM: number
  botM: number
  lenM: number
}

function formatLen(m: number): string {
  return m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км`
}

export default function ResortMap3D({ points }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [trailsLoaded, setTrailsLoaded] = useState(true)

  const pointsKey = points.map((p) => `${p.lat},${p.lng}`).join(';')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || points.length === 0) return
    let disposed = false
    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let frameId = 0
    const cleanups: (() => void)[] = []
    const scene = new THREE.Scene()

    const bbox = computeBbox(points)
    const cLat = (bbox.s + bbox.n) / 2
    const cLng = (bbox.w + bbox.e) / 2
    const metersX = (lo: number) => (lo - cLng) * 111320 * Math.cos((cLat * Math.PI) / 180)
    const metersZ = (la: number) => (cLat - la) * 110540
    const distM = (a: LatLng, b: { lat: number; lon: number }) => {
      const dx = (a.lng - b.lon) * 111320 * Math.cos((cLat * Math.PI) / 180)
      const dz = (a.lat - b.lat) * 110540
      return Math.hypot(dx, dz)
    }

    const build = async () => {
      const elevation = await buildElevationSampler(bbox)
      if (disposed) return

      scene.background = new THREE.Color('#0c1222')

      // --- Облако точек рельефа ---
      const positions = new Float32Array(GRID * GRID * 3)
      const colors = new Float32Array(GRID * GRID * 3)
      let minE = Infinity
      let maxE = -Infinity
      const elevGrid: number[] = []
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          const la = bbox.s + ((bbox.n - bbox.s) * j) / (GRID - 1)
          const lo = bbox.w + ((bbox.e - bbox.w) * i) / (GRID - 1)
          const e = elevation(la, lo)
          elevGrid.push(e)
          if (e < minE) minE = e
          if (e > maxE) maxE = e
        }
      }
      // Верх — светло-серый, не белый: на белом терялись чёрные трассы
      const low = new THREE.Color('#33415e')
      const high = new THREE.Color('#cbd5e1')
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          const idx = j * GRID + i
          const la = bbox.s + ((bbox.n - bbox.s) * j) / (GRID - 1)
          const lo = bbox.w + ((bbox.e - bbox.w) * i) / (GRID - 1)
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
      const extentX = (bbox.e - bbox.w) * 111320 * Math.cos((cLat * Math.PI) / 180)
      const extentZ = (bbox.n - bbox.s) * 110540
      const extent = Math.max(extentX, extentZ)
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: (extent / GRID) * 1.1, vertexColors: true })))

      // --- Трассы и подъёмники ---
      const lineMaterials: LineMaterial[] = []
      const hoverables: Line2[] = []
      const records: WayRecord[] = []
      const resolution = new THREE.Vector2(mount.clientWidth, mount.clientHeight)

      const addLine = (pts: THREE.Vector3[], color: string, width: number, recIndex: number, isHalo: boolean) => {
        const lineGeo = new LineGeometry()
        lineGeo.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]))
        const mat = new LineMaterial({ color, linewidth: width, resolution: resolution.clone() })
        lineMaterials.push(mat)
        const line = new Line2(lineGeo, mat)
        line.computeLineDistances()
        line.userData.recIndex = recIndex
        if (isHalo) {
          line.renderOrder = 1
        } else {
          line.renderOrder = 2
          hoverables.push(line)
          records[recIndex].materials.push(mat)
        }
        scene.add(line)
      }

      try {
        const ways = await fetchOsmWays(bbox)
        if (disposed) return
        for (const way of ways) {
          if (!way.geometry) continue
          // Чужие трассы: должна проходить рядом хотя бы с одной точкой курорта
          if (!way.geometry.some((g) => points.some((p) => distM(p, g) < NEAR_POINT_M))) continue

          const isLift = !!way.tags?.aerialway
          const style = isLift
            ? { color: LIFT_COLOR, label: '', halo: false }
            : PISTE_STYLE[way.tags?.['piste:difficulty'] ?? ''] ?? DEFAULT_PISTE

          // Клиппинг: рвём линию на куски внутри области, чтобы не вылезала за модель
          const runs: { lat: number; lon: number }[][] = []
          let run: { lat: number; lon: number }[] = []
          for (const g of way.geometry) {
            const inside = g.lat >= bbox.s && g.lat <= bbox.n && g.lon >= bbox.w && g.lon <= bbox.e
            if (inside) {
              run.push(g)
            } else if (run.length) {
              runs.push(run)
              run = []
            }
          }
          if (run.length) runs.push(run)
          const usable = runs.filter((r) => r.length >= 2)
          if (!usable.length) continue

          // Инфо для тултипа: высоты и длина по видимой части
          let topM = -Infinity
          let botM = Infinity
          let lenM = 0
          for (const r of usable) {
            for (let k = 0; k < r.length; k++) {
              const e = elevation(r[k].lat, r[k].lon)
              if (e > topM) topM = e
              if (e < botM) botM = e
              if (k > 0) lenM += distM({ lat: r[k - 1].lat, lng: r[k - 1].lon }, r[k])
            }
          }

          const name = way.tags?.name || way.tags?.ref || ''
          const title = name || (isLift ? 'Подъёмник' : 'Трасса')
          const subtitle = isLift
            ? LIFT_LABELS[way.tags?.aerialway ?? ''] ?? 'Подъёмник'
            : `Трасса · ${style.label}`

          const recIndex = records.length
          records.push({
            materials: [],
            baseColor: new THREE.Color(style.color),
            baseWidth: isLift ? 3 : 3.5,
            title,
            subtitle,
            topM,
            botM,
            lenM,
          })

          for (const r of usable) {
            const pts = r.map((g) => new THREE.Vector3(
              metersX(g.lon),
              (elevation(g.lat, g.lon) - minE) * Z_EXAGGERATION + 20,
              metersZ(g.lat),
            ))
            // Чёрные трассы — со светлой подложкой, иначе теряются на точках
            if (style.halo) addLine(pts, '#e2e8f0', records[recIndex].baseWidth + 2.5, recIndex, true)
            addLine(pts, style.color, records[recIndex].baseWidth, recIndex, false)
          }
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
      controls.addEventListener('start', () => { controls!.autoRotate = false })

      // --- Hover: подсветка + тултип ---
      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()
      let hovered: WayRecord | null = null

      const setHighlight = (rec: WayRecord | null) => {
        if (hovered === rec) return
        if (hovered) {
          for (const m of hovered.materials) {
            m.color.copy(hovered.baseColor)
            m.linewidth = hovered.baseWidth
          }
        }
        hovered = rec
        if (rec) {
          for (const m of rec.materials) {
            m.color.copy(rec.baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.45))
            m.linewidth = rec.baseWidth + 2
          }
        }
        if (renderer) renderer.domElement.style.cursor = rec ? 'pointer' : 'grab'
      }

      const onPointerMove = (e: PointerEvent) => {
        if (!renderer) return
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouse, camera)
        raycaster.camera = camera
        const hit = raycaster.intersectObjects(hoverables, false)[0]
        const rec = hit ? records[(hit.object as Line2).userData.recIndex as number] : null
        setHighlight(rec)

        const tip = tooltipRef.current
        if (tip) {
          if (rec) {
            tip.style.display = 'block'
            tip.style.left = `${e.clientX - rect.left + 14}px`
            tip.style.top = `${e.clientY - rect.top + 14}px`
            tip.innerHTML =
              `<strong>${rec.title}</strong><br>${rec.subtitle}<br>` +
              `▲ ${Math.round(rec.topM)} м · ▼ ${Math.round(rec.botM)} м<br>` +
              `Протяжённость: ${formatLen(rec.lenM)}`
          } else {
            tip.style.display = 'none'
          }
        }
      }
      const onPointerLeave = () => {
        setHighlight(null)
        if (tooltipRef.current) tooltipRef.current.style.display = 'none'
      }
      renderer.domElement.addEventListener('pointermove', onPointerMove)
      renderer.domElement.addEventListener('pointerleave', onPointerLeave)
      cleanups.push(() => {
        renderer?.domElement.removeEventListener('pointermove', onPointerMove)
        renderer?.domElement.removeEventListener('pointerleave', onPointerLeave)
      })

      const onResize = () => {
        if (!renderer) return
        camera.aspect = mount.clientWidth / mount.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(mount.clientWidth, mount.clientHeight)
        for (const m of lineMaterials) m.resolution.set(mount.clientWidth, mount.clientHeight)
      }
      window.addEventListener('resize', onResize)
      cleanups.push(() => window.removeEventListener('resize', onResize))

      const animate = () => {
        frameId = requestAnimationFrame(animate)
        controls!.update()
        renderer!.render(scene, camera)
      }
      animate()
      setStatus('ready')
    }

    build().catch(() => { if (!disposed) setStatus('error') })

    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      for (const c of cleanups) c()
      controls?.dispose()
      scene.traverse((obj) => {
        const o = obj as THREE.Mesh
        o.geometry?.dispose?.()
        const mat = o.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose?.()
      })
      if (renderer) {
        renderer.dispose()
        renderer.domElement.remove()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey])

  if (status === 'error') {
    return <div className="empty-state"><p>Не удалось загрузить данные рельефа. Попробуйте позже.</p></div>
  }

  return (
    <div className="map3d-wrap">
      {status === 'loading' && <div className="loading map3d-loading">Строим гору из точек...</div>}
      <div ref={mountRef} className="map3d-canvas" />
      <div ref={tooltipRef} className="map3d-tooltip" />
      {status === 'ready' && (
        <>
          <div className="map3d-legend">
            <span><i style={{ background: '#22c55e' }} /> Зелёная</span>
            <span><i style={{ background: '#3b82f6' }} /> Синяя</span>
            <span><i style={{ background: '#ef4444' }} /> Красная</span>
            <span><i style={{ background: '#111827', outline: '1px solid #e2e8f0' }} /> Чёрная</span>
            <span><i style={{ background: '#a78bfa' }} /> Фрирайд</span>
            <span><i style={{ background: '#fbbf24' }} /> Подъёмник</span>
          </div>
          <p className="map3d-hint">
            Вращайте мышью, зум — колесом, наведите на трассу для подробностей
            {!trailsLoaded && ' · трассы не загрузились, показан только рельеф'}
          </p>
        </>
      )}
    </div>
  )
}
