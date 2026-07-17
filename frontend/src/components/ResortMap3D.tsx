import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { api, type Resort, type AltitudePoint } from '../api/client'

/**
 * Точечная 3D-модель горы: рельеф — облако точек из открытых DEM-тайлов
 * (AWS Terrain Tiles, формат terrarium), поверх — трассы и подъёмники из
 * OpenStreetMap. Область строится по точкам высот курорта; чужие трассы
 * отсекаются по удалённости от них. Наведение подсвечивает трассу и
 * показывает название, высоты и протяжённость.
 */

type LatLng = { lat: number; lng: number }
type Props = {
  /** Текущий курорт — трассы назначаются ближайшему из всех курортов */
  resortId: number
  /** Точки высот курорта — задают область карты */
  points: LatLng[]
  /** points — облако точек, solid — сплошной рельеф */
  variant?: 'points' | 'solid'
}

const GRID = 150
const Z_EXAGGERATION = 1.35
const PAD_DEG = 0.025 // запас области вокруг точек курорта (~2.5 км)
const MIN_HALF_DEG = 0.035 // минимальный полуразмер области
const MAX_ASSIGN_M = 4000 // дальше этого от точек курорта трасса не считается ничьей

// Европейская схема сложности, как на схемах курортов
const PISTE_STYLE: Record<string, { color: string; label: string; halo?: boolean }> = {
  novice: { color: '#22c55e', label: 'зелёная' },
  easy: { color: '#3b82f6', label: 'синяя' },
  intermediate: { color: '#ef4444', label: 'красная' },
  advanced: { color: '#111827', label: 'чёрная', halo: true },
  expert: { color: '#111827', label: 'чёрная (эксперт)', halo: true },
  // Отдельной категории «фрирайд» на схемах курортов нет — маркируется чёрной
  freeride: { color: '#111827', label: 'чёрная (фрирайд)', halo: true },
}
const DEFAULT_PISTE = { color: '#94a3b8', label: 'без категории', halo: false }
const LIFT_COLOR = '#fbbf24'
const LIFT_LABELS: Record<string, string> = {
  cable_car: 'Канатная дорога',
  gondola: 'Кабинка (Гондола)',
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
  id: number
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

/** Точки высот всех курортов — для назначения трасс ближайшему курорту */
async function fetchAllResortPoints(): Promise<{ id: number; pts: LatLng[] }[]> {
  const resorts = await api.get<Resort[]>('/resorts')
  const result = await Promise.all(
    resorts.map(async (r) => {
      try {
        const pts = await api.get<AltitudePoint[]>(`/weather/${r.id}/altitude-points`)
        return { id: r.id, pts: pts.filter((p) => p.is_active).map((p) => ({ lat: p.latitude, lng: p.longitude })) }
      } catch {
        return { id: r.id, pts: [] }
      }
    })
  )
  return result.filter((r) => r.pts.length > 0)
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
  haloMaterials: LineMaterial[]
  kind: FilterKind
  dimmed: boolean
  baseColor: THREE.Color
  baseWidth: number
  title: string
  subtitle: string
  topM: number
  botM: number
  lenM: number
}

type FilterKind = 'lift' | 'green' | 'blue' | 'red' | 'black' | 'other'

const DIFFICULTY_KIND: Record<string, FilterKind> = {
  novice: 'green',
  easy: 'blue',
  intermediate: 'red',
  advanced: 'black',
  expert: 'black',
  freeride: 'black',
}

const FILTER_CHIPS: { kind: FilterKind; label: string }[] = [
  { kind: 'lift', label: 'Подъёмники' },
  { kind: 'green', label: '🟢 Зелёные' },
  { kind: 'blue', label: '🔵 Синие' },
  { kind: 'red', label: '🔴 Красные' },
  { kind: 'black', label: '⚫ Чёрные' },
]

/** Приглушает всё, что не подходит под активные фильтры */
function applyFilters(records: WayRecord[], filters: Set<FilterKind>) {
  for (const rec of records) {
    rec.dimmed = filters.size > 0 && !filters.has(rec.kind)
    for (const m of [...rec.materials, ...rec.haloMaterials]) {
      m.transparent = true
      m.opacity = rec.dimmed ? 0.3 : 1
    }
  }
}

function formatLen(m: number): string {
  return m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км`
}

export default function ResortMap3D({ resortId, points, variant = 'points' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [trailsLoaded, setTrailsLoaded] = useState(true)
  const [filters, setFilters] = useState<Set<FilterKind>>(new Set())
  const recordsRef = useRef<WayRecord[]>([])
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  useEffect(() => {
    applyFilters(recordsRef.current, filters)
  }, [filters])

  const toggleFilter = (kind: FilterKind) => {
    setFilters((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

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
      if (variant === 'solid') {
        // Сплошной рельеф: те же вершины, но с триангуляцией и освещением
        const indices: number[] = []
        for (let j = 0; j < GRID - 1; j++) {
          for (let i = 0; i < GRID - 1; i++) {
            const a = j * GRID + i
            const b = a + 1
            const c = a + GRID
            const d = c + 1
            indices.push(a, c, b, b, c, d)
          }
        }
        geo.setIndex(indices)
        geo.computeVertexNormals()
        scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
          vertexColors: true,
          flatShading: true,
          side: THREE.DoubleSide,
        })))
        scene.add(new THREE.AmbientLight('#ffffff', 0.55))
        const sun = new THREE.DirectionalLight('#ffffff', 1.1)
        sun.position.set(-extent, extent * 0.8, -extent * 0.5)
        scene.add(sun)
      } else {
        scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: (extent / GRID) * 1.1, vertexColors: true })))
      }

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
          records[recIndex].haloMaterials.push(mat)
        } else {
          line.renderOrder = 2
          hoverables.push(line)
          records[recIndex].materials.push(mat)
        }
        scene.add(line)
      }

      try {
        const [ways, allResorts] = await Promise.all([fetchOsmWays(bbox), fetchAllResortPoints()])
        if (disposed) return

        // Расстояние от трассы до курорта = мин. расстояние вершин до его точек высот
        const wayDistToResort = (way: OsmWay, pts: LatLng[]) => {
          let best = Infinity
          for (const g of way.geometry!) {
            for (const p of pts) {
              const d = distM(p, g)
              if (d < best) best = d
            }
          }
          return best
        }

        // Трасса принадлежит ближайшему курорту — чужие не показываем.
        // Если сектор курорта не покрыт точками высот, его трассы могут отойти
        // соседу: лечится добавлением (вспомогательной) точки высот через админку.
        const kept = ways.filter((way) => {
          if (!way.geometry) return false
          let bestResort = -1
          let bestDist = Infinity
          for (const r of allResorts) {
            const d = wayDistToResort(way, r.pts)
            if (d < bestDist) {
              bestDist = d
              bestResort = r.id
            }
          }
          return bestResort === resortId && bestDist <= MAX_ASSIGN_M
        })

        // В OSM одна трасса часто разбита на несколько way — группируем по
        // имени и категории, чтобы подсветка и длина были по всей трассе.
        const groups = new Map<string, OsmWay[]>()
        for (const way of kept) {
          const t = way.tags ?? {}
          const nameKey = t.name || t.ref || `#${way.id}`
          const key = t.aerialway ? `L|${t.aerialway}|${nameKey}` : `P|${t['piste:difficulty'] ?? ''}|${nameKey}`
          const arr = groups.get(key)
          if (arr) arr.push(way)
          else groups.set(key, [way])
        }

        for (const members of groups.values()) {
          const first = members[0]
          const isLift = !!first.tags?.aerialway
          const style = isLift
            ? { color: LIFT_COLOR, label: '', halo: false }
            : PISTE_STYLE[first.tags?.['piste:difficulty'] ?? ''] ?? DEFAULT_PISTE

          // Клиппинг: рвём линии на куски внутри области, чтобы не вылезали за модель
          const usable: { lat: number; lon: number }[][] = []
          for (const way of members) {
            let run: { lat: number; lon: number }[] = []
            for (const g of way.geometry!) {
              const inside = g.lat >= bbox.s && g.lat <= bbox.n && g.lon >= bbox.w && g.lon <= bbox.e
              if (inside) {
                run.push(g)
              } else if (run.length) {
                if (run.length >= 2) usable.push(run)
                run = []
              }
            }
            if (run.length >= 2) usable.push(run)
          }
          if (!usable.length) continue

          // Инфо для тултипа: высоты и длина по всем сегментам трассы
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

          const tagName = first.tags?.name
          const tagRef = first.tags?.ref
          const name = tagName && tagRef ? `${tagName} (${tagRef})` : tagName || tagRef || ''
          const title = name || (isLift ? 'Подъёмник' : 'Трасса')
          const subtitle = isLift
            ? LIFT_LABELS[first.tags?.aerialway ?? ''] ?? 'Подъёмник'
            : `Трасса · ${style.label}`

          const recIndex = records.length
          records.push({
            materials: [],
            haloMaterials: [],
            kind: isLift ? 'lift' : DIFFICULTY_KIND[first.tags?.['piste:difficulty'] ?? ''] ?? 'other',
            dimmed: false,
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
      recordsRef.current = records
      applyFilters(records, filtersRef.current)

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
        // Приглушённые фильтром линии не реагируют на наведение
        const hit = raycaster
          .intersectObjects(hoverables, false)
          .find((h) => !records[(h.object as Line2).userData.recIndex as number]?.dimmed)
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
  }, [pointsKey, resortId, variant])

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
            <span><i style={{ background: '#fbbf24' }} /> Подъёмник</span>
          </div>
          {trailsLoaded && (
            <div className="map3d-filters">
              {FILTER_CHIPS.map((c) => (
                <button
                  key={c.kind}
                  type="button"
                  className={`btn btn-sm ${filters.has(c.kind) ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => toggleFilter(c.kind)}
                >
                  {c.label}
                </button>
              ))}
              {filters.size > 0 && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFilters(new Set())}>
                  Сбросить
                </button>
              )}
            </div>
          )}
          <p className="map3d-hint">
            Управление: вращение — левая кнопка мыши, перемещение — правая, зум — колесо.
            Наведите на трассу или подъёмник для подробностей.
            {!trailsLoaded && ' Трассы не загрузились, показан только рельеф.'}
          </p>
        </>
      )}
    </div>
  )
}
