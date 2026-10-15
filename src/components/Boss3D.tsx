import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { BossDesign, BossTraits } from '../lib/bossGen'

/**
 * O chefao da semana em 3D.
 *
 * Montado so com formas simples (esfera, capsula, cone, toro) e sombreamento
 * cartoon com contorno: cada peca do gerador vira um pedaco do boneco, entao
 * combinacoes novas nao exigem modelo novo. Carregado sob demanda (lazy) — o
 * three.js pesa e nao pode atrasar a abertura do app.
 *
 * Toque cutuca (ele responde com uma provocacao); arrastar gira. Quando a vida
 * cai desde a ultima visita, ele leva o golpe na sua frente.
 */

interface Props {
  design: BossDesign
  /** Vida restante, 0 a 1. */
  life: number
  defeated: boolean
  height?: number
}

const OUTLINE = '#0b0f17'

export default function Boss3D({ design, life, defeated, height = 230 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<BossApi | null>(null)
  const [taunt, setTaunt] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  // Cena: monta uma vez por chefao (a semana muda o design).
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let api: BossApi
    try {
      api = createBoss(mount, design.traits)
    } catch {
      setFailed(true)
      return
    }
    apiRef.current = api
    return () => {
      api.dispose()
      apiRef.current = null
    }
  }, [design])

  useEffect(() => {
    apiRef.current?.setDefeated(defeated)
  }, [defeated, design])

  // Golpe: a vida caiu desde a ultima vez que voce olhou para este chefao.
  useEffect(() => {
    const key = `boss:life:${design.seed}`
    let seen: number | null = null
    try {
      const raw = localStorage.getItem(key)
      seen = raw === null ? null : Number(raw)
    } catch {
      // sem storage: so perde a animacao do golpe
    }
    if (seen !== null && life < seen - 0.001) {
      const timer = window.setTimeout(() => apiRef.current?.hit(), 450)
      return () => window.clearTimeout(timer)
    }
    try {
      localStorage.setItem(key, String(life))
    } catch {
      // idem
    }
  }, [life, design.seed])

  // Grava a vida depois do golpe, para ele nao se repetir a cada visita.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(`boss:life:${design.seed}`, String(life))
      } catch {
        // idem
      }
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [life, design.seed])

  useEffect(() => {
    if (!taunt) return
    const timer = window.setTimeout(() => setTaunt(null), 2200)
    return () => window.clearTimeout(timer)
  }, [taunt])

  const onPoke = () => {
    apiRef.current?.poke()
    if (defeated) {
      setTaunt('…')
      return
    }
    const options = design.taunts.filter((t) => t !== taunt)
    setTaunt(options[Math.floor(Math.random() * options.length)] ?? design.taunts[0])
  }

  if (failed) {
    return (
      <div className="flex items-center justify-center text-7xl" style={{ height }} aria-hidden="true">
        👹
      </div>
    )
  }

  return (
    <div className="relative" style={{ height }}>
      <div
        ref={mountRef}
        className="h-full w-full touch-pan-y"
        onPointerDown={(e) => apiRef.current?.dragStart(e.clientX)}
        onPointerMove={(e) => apiRef.current?.dragMove(e.clientX)}
        onPointerUp={(e) => {
          if (apiRef.current?.dragEnd(e.clientX)) onPoke()
        }}
        onPointerCancel={() => apiRef.current?.dragEnd(null)}
        role="img"
        aria-label={`${design.name}${defeated ? ', derrotado' : ''}. Toque para cutucar, arraste para girar.`}
      />
      {taunt && (
        <div
          key={taunt}
          className="animate-pop-in pointer-events-none absolute left-1/2 top-2 max-w-[80%] -translate-x-1/2 rounded-2xl border-2 border-ink-950 bg-ink-50 px-3 py-1.5 text-center text-xs font-bold text-ink-950 shadow-lg"
        >
          {taunt}
          <span className="absolute -bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-ink-950 bg-ink-50" />
        </div>
      )}
    </div>
  )
}

/* ================================================================ cena */

interface BossApi {
  hit: () => void
  poke: () => void
  setDefeated: (value: boolean) => void
  dragStart: (x: number) => void
  dragMove: (x: number) => void
  /** true = foi um toque (quase sem arrasto). */
  dragEnd: (x: number | null) => boolean
  dispose: () => void
}

/** Dimensoes do corpo e funcoes de superficie para encaixar as pecas. */
interface BodyShape {
  geometry: THREE.BufferGeometry
  scale: THREE.Vector3
  hw: number
  hh: number
  /** Profundidade da frente do corpo no ponto (x, y). */
  frontZ: (x: number, y: number) => number
  /** Topo do corpo na coluna x. */
  topY: (x: number) => number
  bottomY: (x: number) => number
}

function bodyShape(t: BossTraits): BodyShape {
  const s = t.stretch
  if (t.body === 'bolha') {
    const hw = 1.15
    const hh = 1.0 * s
    const hz = 1.0
    const ell = (x: number, y: number) => 1 - (x / hw) ** 2 - (y / hh) ** 2
    return {
      geometry: new THREE.SphereGeometry(1, 40, 28),
      scale: new THREE.Vector3(hw, hh, hz),
      hw,
      hh,
      frontZ: (x, y) => hz * Math.sqrt(Math.max(0, ell(x, y))),
      topY: (x) => hh * Math.sqrt(Math.max(0, 1 - (x / hw) ** 2)),
      bottomY: (x) => -hh * Math.sqrt(Math.max(0, 1 - (x / hw) ** 2)),
    }
  }
  if (t.body === 'torre') {
    const r = 0.78
    const half = 0.55 * s
    const hh = r + half
    const z = (x: number, y: number) => {
      const dy = Math.max(0, Math.abs(y) - half)
      return Math.sqrt(Math.max(0, r * r - x * x - dy * dy))
    }
    return {
      geometry: new THREE.CapsuleGeometry(r, half * 2, 10, 28),
      scale: new THREE.Vector3(1, 1, 1),
      hw: r,
      hh,
      frontZ: z,
      topY: (x) => half + Math.sqrt(Math.max(0, r * r - x * x)),
      bottomY: (x) => -half - Math.sqrt(Math.max(0, r * r - x * x)),
    }
  }
  if (t.body === 'bloco') {
    const hw = 0.95
    const hh = 0.88 * s
    const hz = 0.72
    return {
      geometry: roundedBox(hw * 2, hh * 2, hz * 2, 0.22),
      scale: new THREE.Vector3(1, 1, 1),
      hw,
      hh,
      frontZ: () => hz,
      topY: () => hh,
      bottomY: () => -hh,
    }
  }
  // pera: base larga, cabeca estreita
  const hh = 1.1 * s
  const radius = (y: number) => {
    const t01 = Math.min(1, Math.max(0, (y + hh) / (2 * hh)))
    return 1.2 * Math.sin(Math.PI * t01) ** 0.6 * (1 - 0.38 * t01)
  }
  const points: THREE.Vector2[] = []
  for (let i = 0; i <= 32; i++) {
    const y = -hh + (2 * hh * i) / 32
    points.push(new THREE.Vector2(Math.max(0.001, radius(y)), y))
  }
  return {
    geometry: new THREE.LatheGeometry(points, 40),
    scale: new THREE.Vector3(1, 1, 1),
    hw: radius(-hh * 0.3),
    hh,
    frontZ: (x, y) => Math.sqrt(Math.max(0, radius(y) ** 2 - x * x)),
    topY: (x) => {
      for (let y = hh; y > -hh; y -= 0.02) if (radius(y) >= Math.abs(x)) return y
      return 0
    },
    bottomY: (x) => {
      for (let y = -hh; y < hh; y += 0.02) if (radius(y) >= Math.abs(x)) return y
      return 0
    },
  }
}

/** Caixa de cantos arredondados: um cubo de muitos segmentos "inflado" nos cantos. */
function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d, 10, 10, 10)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r)
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const clamped = new THREE.Vector3(
      THREE.MathUtils.clamp(v.x, -inner.x, inner.x),
      THREE.MathUtils.clamp(v.y, -inner.y, inner.y),
      THREE.MathUtils.clamp(v.z, -inner.z, inner.z),
    )
    const dir = v.clone().sub(clamped)
    if (dir.lengthSq() > 0) v.copy(clamped.add(dir.normalize().multiplyScalar(r)))
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

function createBoss(mount: HTMLDivElement, t: BossTraits): BossApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  mount.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
  camera.position.set(0, 0.9, 8.2)
  camera.lookAt(0, 0.15, 0)

  scene.add(new THREE.HemisphereLight('#c7d2fe', '#1e1b4b', 1.4))
  const sun = new THREE.DirectionalLight('#ffffff', 2.4)
  sun.position.set(3, 5, 4)
  scene.add(sun)
  const rim = new THREE.DirectionalLight('#f97316', 1.2)
  rim.position.set(-4, 2, -3)
  scene.add(rim)

  // Tres faixas de luz: o visual "desenho animado".
  const gradient = new THREE.DataTexture(new Uint8Array([70, 160, 255]), 3, 1, THREE.RedFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.needsUpdate = true

  const toonMats: THREE.MeshToonMaterial[] = []
  const toon = (color: THREE.ColorRepresentation, side: THREE.Side = THREE.FrontSide) => {
    const mat = new THREE.MeshToonMaterial({ color, gradientMap: gradient, side })
    mat.userData.base = mat.color.clone()
    toonMats.push(mat)
    return mat
  }
  const outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide })
  const flatMat = (color: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color })

  /** Peca com contorno: copia escura levemente maior, so com o verso visivel. */
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, outline = 0.06) => {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(geo, mat))
    if (outline > 0) {
      const edge = new THREE.Mesh(geo, outlineMat)
      edge.scale.setScalar(1 + outline)
      group.add(edge)
    }
    return group
  }

  const color = new THREE.Color(t.color)
  const accent = new THREE.Color(t.accent)
  const belly = color.clone().lerp(new THREE.Color('#ffffff'), 0.35)
  const shape = bodyShape(t)

  const root = new THREE.Group() // gira e cai
  const boss = new THREE.Group() // respira e flutua
  root.add(boss)
  scene.add(root)

  /* corpo */
  const body = part(shape.geometry, toon(color), 0.035)
  body.scale.copy(shape.scale)
  boss.add(body)

  {
    const y = -shape.hh * 0.55
    const b = part(new THREE.SphereGeometry(1, 24, 16), toon(belly), 0)
    b.scale.set(shape.hw * 0.5, shape.hh * 0.28, 0.25)
    b.position.set(0, y, shape.frontZ(0, y) - 0.17)
    boss.add(b)
  }

  /* olhos */
  const eyes: THREE.Group[] = []
  const eyeY = shape.hh * (t.body === 'bloco' ? 0.4 : 0.32)
  const eyeSpots: Array<[number, number, number]> =
    t.eyes === 1
      ? [[0, eyeY, 0.36]]
      : t.eyes === 2
        ? [
            [-shape.hw * 0.36, eyeY, 0.22],
            [shape.hw * 0.36, eyeY, 0.22],
          ]
        : [
            [-shape.hw * 0.42, eyeY - 0.05, 0.19],
            [shape.hw * 0.42, eyeY - 0.05, 0.19],
            [0, eyeY + 0.36, 0.17],
          ]
  for (const [x, y, base] of eyeSpots) {
    const r = base * t.eyeSize
    const eye = new THREE.Group()
    eye.add(part(new THREE.SphereGeometry(r, 24, 16), toon('#f8fafc'), 0.08))
    const pupil = new THREE.Group()
    pupil.name = 'pupil'
    const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.52, 16, 12), flatMat('#0b0f17'))
    p.position.z = r * 0.62
    const shine = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 8, 8), flatMat('#ffffff'))
    shine.position.set(r * 0.18, r * 0.2, r * 1.05)
    pupil.add(p, shine)
    const cross = new THREE.Group()
    cross.name = 'cross'
    cross.visible = false
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(r * 1.4, r * 0.28, 0.04), flatMat('#0b0f17'))
      bar.rotation.z = angle
      bar.position.z = r * 1.0
      cross.add(bar)
    }
    eye.add(pupil, cross)
    // Sobrancelha brava: ponta de dentro mais baixa. Olho central ganha um V.
    const inward = x === 0 ? 0 : Math.sign(x)
    const browPieces = inward === 0 ? [-1, 1] : [inward]
    for (const dir of browPieces) {
      const brow = part(new THREE.BoxGeometry(r * 1.25, r * 0.3, r * 0.4), toon('#1a0b14'), 0)
      brow.position.set(inward === 0 ? dir * r * 0.55 : 0, r * 1.15, r * 0.55)
      brow.rotation.z = dir * 0.45
      eye.add(brow)
    }
    eye.position.set(x, y, shape.frontZ(x, y) - r * 0.35)
    boss.add(eye)
    eyes.push(eye)
  }

  /* boca */
  {
    const y = -shape.hh * 0.08
    const z = shape.frontZ(0, y)
    const mw = shape.hw * 0.5
    const dark = flatMat('#1a0b14')
    const mouth = new THREE.Group()
    if (t.mouth === 'sorriso') {
      const smile = new THREE.Mesh(new THREE.TorusGeometry(mw * 0.75, 0.06, 8, 24, Math.PI), dark)
      smile.rotation.z = Math.PI
      smile.position.y = 0.16
      mouth.add(smile)
    } else {
      const open = t.mouth === 'boca-aberta'
      const hole = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), dark)
      hole.scale.set(open ? mw * 0.65 : mw * 0.85, open ? 0.3 : 0.16, 0.1)
      mouth.add(hole)
      const white = toon('#f8fafc')
      if (t.mouth === 'presas') {
        for (const side of [-1, 1]) {
          const fang = part(new THREE.ConeGeometry(0.075, 0.24, 10), white, 0.1)
          fang.rotation.x = Math.PI
          fang.position.set(side * mw * 0.5, 0.02, 0.06)
          mouth.add(fang)
        }
      } else if (t.mouth === 'dentuca') {
        for (const side of [-1, 1]) {
          const tooth = part(new THREE.BoxGeometry(0.13, 0.17, 0.05), white, 0.12)
          tooth.position.set(side * 0.075, 0.06, 0.08)
          mouth.add(tooth)
        }
      } else {
        const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), flatMat('#ef4444'))
        tongue.scale.set(0.2, 0.1, 0.06)
        tongue.position.set(0, -0.14, 0.05)
        mouth.add(tongue)
      }
    }
    mouth.position.set(0, y, z - 0.02)
    boss.add(mouth)
  }

  /* chifres */
  const hornMat = toon(accent)
  if (t.horns === 'par') {
    for (const side of [-1, 1]) {
      const x = side * shape.hw * 0.45
      const horn = part(new THREE.ConeGeometry(0.16, 0.6, 14), hornMat)
      horn.position.set(x, shape.topY(x) + 0.18, 0)
      horn.rotation.z = -side * 0.4
      boss.add(horn)
    }
  } else if (t.horns === 'unicornio') {
    const horn = part(new THREE.ConeGeometry(0.13, 0.8, 14), hornMat)
    horn.position.set(0, shape.topY(0) + 0.3, 0.15)
    horn.rotation.x = 0.25
    boss.add(horn)
  } else if (t.horns === 'galhada') {
    for (const side of [-1, 1]) {
      const x = side * shape.hw * 0.4
      const antler = new THREE.Group()
      const main = part(new THREE.CylinderGeometry(0.035, 0.07, 0.65, 8), hornMat)
      main.position.y = 0.3
      antler.add(main)
      for (const [h, len] of [
        [0.3, 0.3],
        [0.5, 0.24],
      ]) {
        const branch = part(new THREE.CylinderGeometry(0.025, 0.045, len, 8), hornMat)
        branch.position.set(side * 0.1, h, 0)
        branch.rotation.z = -side * 0.9
        antler.add(branch)
      }
      antler.position.set(x, shape.topY(x) - 0.05, 0)
      antler.rotation.z = -side * 0.3
      boss.add(antler)
    }
  }

  /* bracos */
  const arms: THREE.Group[] = []
  const armY = -shape.hh * 0.1
  if (t.arms === 'cotocos') {
    for (const side of [-1, 1]) {
      const arm = part(new THREE.SphereGeometry(0.3, 20, 14), toon(color))
      arm.scale.set(0.8, 1, 0.85)
      arm.position.set(side * shape.hw * 1.0, armY, 0.1)
      arm.userData.side = side
      boss.add(arm)
      arms.push(arm)
    }
  } else if (t.arms === 'tentaculos') {
    for (const side of [-1, 1]) {
      const arm = new THREE.Group()
      let x = 0
      let y = 0
      for (let i = 0; i < 6; i++) {
        const r = 0.2 - i * 0.025
        const seg = part(new THREE.SphereGeometry(r, 14, 10), toon(i % 2 ? color : belly))
        x += side * r * 1.15
        y -= r * 0.7
        seg.position.set(x, y, 0)
        arm.add(seg)
      }
      arm.position.set(side * shape.hw * 0.85, armY, 0.1)
      arm.userData.side = side
      boss.add(arm)
      arms.push(arm)
    }
  } else if (t.arms === 'garras') {
    for (const side of [-1, 1]) {
      const arm = new THREE.Group()
      const limb = part(new THREE.CapsuleGeometry(0.13, 0.45, 6, 12), toon(color))
      limb.rotation.z = side * 1.1
      limb.position.set(side * 0.28, -0.1, 0)
      arm.add(limb)
      for (const k of [-1, 0, 1]) {
        const claw = part(new THREE.ConeGeometry(0.05, 0.2, 8), hornMat, 0.12)
        claw.position.set(side * 0.56, -0.3 + k * 0.06, k * 0.07)
        claw.rotation.z = side * (Math.PI / 2 + 0.5)
        arm.add(claw)
      }
      arm.position.set(side * shape.hw * 0.92, armY, 0.1)
      arm.userData.side = side
      boss.add(arm)
      arms.push(arm)
    }
  }

  /* pernas */
  const legs: THREE.Group[] = []
  if (t.legs === 'cotocos') {
    for (const side of [-1, 1]) {
      const x = side * shape.hw * 0.42
      const leg = part(new THREE.CapsuleGeometry(0.2, 0.18, 6, 14), toon(color))
      leg.position.set(x, shape.bottomY(x) - 0.12, 0.05)
      boss.add(leg)
      legs.push(leg)
    }
  } else if (t.legs === 'aranha') {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const leg = new THREE.Group()
        const upper = part(new THREE.CylinderGeometry(0.045, 0.06, 0.6, 8), toon(accent), 0.12)
        upper.position.set(side * 0.24, 0.12, 0)
        upper.rotation.z = -side * 1.1
        const lower = part(new THREE.CylinderGeometry(0.025, 0.045, 0.6, 8), toon(accent), 0.12)
        lower.position.set(side * 0.55, -0.18, 0)
        lower.rotation.z = side * 0.35
        leg.add(upper, lower)
        leg.position.set(side * shape.hw * 0.55, -shape.hh * 0.62, (k - 1) * 0.42)
        leg.rotation.y = side * (k - 1) * -0.45
        leg.userData.phase = k + (side > 0 ? 0.5 : 0)
        boss.add(leg)
        legs.push(leg)
      }
    }
  }

  /* acessorio */
  const wings: THREE.Group[] = []
  let halo: THREE.Object3D | null = null
  if (t.extra === 'coroa') {
    const gold = toon('#fbbf24', THREE.DoubleSide)
    const crown = new THREE.Group()
    crown.add(part(new THREE.CylinderGeometry(0.42, 0.38, 0.22, 20, 1, true), gold, 0.04))
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const spike = part(new THREE.ConeGeometry(0.08, 0.22, 8), gold, 0.08)
      spike.position.set(Math.cos(a) * 0.4, 0.2, Math.sin(a) * 0.4)
      crown.add(spike)
    }
    crown.position.set(0.05, shape.topY(0) + 0.12, 0)
    crown.rotation.z = -0.15
    boss.add(crown)
  } else if (t.extra === 'asas') {
    const wingShape = new THREE.Shape()
    wingShape.moveTo(0, 0)
    wingShape.lineTo(1.25, 0.55)
    wingShape.lineTo(1.05, -0.05)
    wingShape.lineTo(1.35, -0.3)
    wingShape.lineTo(0.85, -0.35)
    wingShape.lineTo(0.95, -0.7)
    wingShape.lineTo(0.25, -0.38)
    wingShape.closePath()
    const geo = new THREE.ShapeGeometry(wingShape)
    for (const side of [-1, 1]) {
      const wing = new THREE.Group()
      const mesh = new THREE.Mesh(geo, toon(accent, THREE.DoubleSide))
      const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.DoubleSide }))
      edge.scale.setScalar(1.06)
      edge.position.z = -0.01
      wing.add(mesh, edge)
      wing.scale.x = side
      wing.position.set(side * shape.hw * 0.35, shape.hh * 0.25, -shape.hw * 0.45)
      wing.userData.side = side
      boss.add(wing)
      wings.push(wing)
    }
  } else if (t.extra === 'espinhos') {
    const spikeMat = toon(accent)
    for (let i = 0; i < 5; i++) {
      const a = 0.25 + i * 0.32
      const spike = part(new THREE.ConeGeometry(0.11, 0.38, 10), spikeMat)
      const y = shape.hh * Math.cos(a) * 0.95
      const z = -shape.frontZ(0, y) * Math.sin(a) * 0.95 - 0.05
      spike.position.set(0, y, Math.min(-0.1, z))
      spike.rotation.x = -a
      boss.add(spike)
    }
  } else if (t.extra === 'aureola') {
    halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 10, 32), flatMat('#fde68a'))
    halo.rotation.x = Math.PI / 2.3
    halo.position.y = shape.topY(0) + 0.45
    boss.add(halo)
  }

  /* chao */
  const floats = t.legs === 'flutua'
  const groundY =
    -shape.hh - (t.legs === 'cotocos' ? 0.42 : t.legs === 'aranha' ? 0.55 : 0.5)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(shape.hw * 0.95, 32),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = groundY
  scene.add(shadow)
  // Centraliza o conjunto na camera: chao embaixo, chifres em cima.
  root.position.y = -(groundY + (shape.hh + 0.6)) / 2 + 0.1

  /* ------------------------------------------------------------ estado */
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  let defeated = false
  let fall = 0
  let hitT = 1
  let pokeT = 1
  let userRot = 0
  let drag: { start: number; last: number } | null = null
  let blinkAt = 2 + Math.random() * 2
  const clock = new THREE.Clock()

  const resize = () => {
    const w = mount.clientWidth
    const h = mount.clientHeight
    if (w === 0 || h === 0) return
    renderer.setSize(w, h, false)
    renderer.domElement.style.width = `${w}px`
    renderer.domElement.style.height = `${h}px`
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  const resizer = new ResizeObserver(resize)
  resizer.observe(mount)

  let visible = true
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
  })
  io.observe(mount)

  let frame = 0
  const loop = () => {
    frame = requestAnimationFrame(loop)
    if (!visible || document.hidden) return
    const dt = Math.min(clock.getDelta(), 0.05)
    const time = clock.elapsedTime
    const motion = reduced ? 0 : 1

    // queda quando derrotado
    fall += ((defeated ? 1 : 0) - fall) * Math.min(1, dt * 4)
    root.rotation.z = fall * 1.45
    root.position.x = fall * 0.4

    // respirar, flutuar, olhar em volta
    const alive = 1 - fall
    const bob = Math.sin(time * 2) * (floats ? 0.12 : 0.04) * motion * alive
    boss.position.y = bob + (floats ? 0.12 : 0)
    const breath = 1 + Math.sin(time * 3) * 0.02 * motion * alive
    pokeT = Math.min(1, pokeT + dt * 3)
    const squash = 1 - Math.sin(pokeT * Math.PI) * 0.16 * (1 - pokeT * 0.3)
    boss.scale.set(1 / Math.sqrt(squash), breath * squash, 1 / Math.sqrt(squash))
    if (!drag) userRot *= 1 - Math.min(1, dt * 1.5)
    root.rotation.y = Math.sin(time * 0.5) * 0.35 * motion * alive + userRot
    shadow.scale.setScalar(1 - bob * 0.8)

    // golpe: tremida + clarao vermelho
    hitT = Math.min(1, hitT + dt * 1.8)
    const flash = 1 - hitT
    boss.position.x = Math.sin(time * 70) * 0.09 * flash
    for (const mat of toonMats) {
      mat.emissive.setRGB(flash * 0.9, 0, 0)
      const base = mat.userData.base as THREE.Color
      if (fall > 0.01) {
        const gray = base.r * 0.3 + base.g * 0.59 + base.b * 0.11
        mat.color.setRGB(
          THREE.MathUtils.lerp(base.r, gray * 0.7, fall),
          THREE.MathUtils.lerp(base.g, gray * 0.7, fall),
          THREE.MathUtils.lerp(base.b, gray * 0.7, fall),
        )
      } else mat.color.copy(base)
    }

    // piscar
    if (time > blinkAt) {
      const k = (time - blinkAt) / 0.14
      const open = k < 1 ? 1 - Math.sin(k * Math.PI) * 0.9 : 1
      for (const eye of eyes) eye.scale.y = defeated ? 1 : open
      if (k >= 1) blinkAt = time + 2.5 + Math.random() * 3
    }

    // membros
    for (const arm of arms) {
      const side = arm.userData.side as number
      arm.rotation.z = side * Math.sin(time * 2.4 + side) * 0.18 * motion * alive
    }
    for (const leg of legs) {
      const phase = (leg.userData.phase as number | undefined) ?? 0
      leg.rotation.x = Math.sin(time * 6 + phase * 2) * 0.12 * motion * alive
    }
    for (const wing of wings) {
      const side = wing.userData.side as number
      wing.rotation.y = side * (0.35 + Math.sin(time * 5) * 0.35 * motion * alive)
    }
    if (halo) halo.position.y += Math.sin(time * 2.2) * 0.002 * motion

    renderer.render(scene, camera)
  }
  loop()

  return {
    hit: () => {
      hitT = 0
    },
    poke: () => {
      pokeT = 0
    },
    setDefeated: (value) => {
      defeated = value
      for (const eye of eyes) {
        eye.getObjectByName('pupil')!.visible = !value
        eye.getObjectByName('cross')!.visible = value
        eye.scale.y = 1
      }
    },
    dragStart: (x) => {
      drag = { start: x, last: x }
    },
    dragMove: (x) => {
      if (!drag) return
      userRot += (x - drag.last) * 0.012
      drag.last = x
    },
    dragEnd: (x) => {
      const tap = drag !== null && x !== null && Math.abs(x - drag.start) < 6
      drag = null
      return tap
    },
    dispose: () => {
      cancelAnimationFrame(frame)
      resizer.disconnect()
      io.disconnect()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const m of mats) m.dispose()
        }
      })
      gradient.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
