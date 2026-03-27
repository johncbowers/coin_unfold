import { ArcballControls, Line } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { memo, useMemo, useState } from 'react'
import { DoubleSide, Matrix4, Quaternion, Vector3 } from 'three'
import { edgeKey, transformPoint } from '../../domain/geometry/polyhedronMath'
import type {
  CoinData,
  CutTree,
  DerivedPolyhedron,
  KeepTree,
  RenderMode,
} from '../../types/polyhedron'

interface PolyhedronSceneProps {
  polyhedron: DerivedPolyhedron
  keepTree: KeepTree
  cutTree: CutTree
  facePoses: Matrix4[]
  coins: CoinData[]
  cameraTarget: Vector3
  cameraDistance: number
  themeMode: 'light' | 'dark'
  renderMode: RenderMode
  showEdges: boolean
  showKeepTree: boolean
  showCutTree: boolean
}

interface FacePolygonProps {
  points: Vector3[]
  color: string
  opacity?: number
}

interface PolylineProps {
  points: Vector3[]
  color: string
}

interface CoinDiscProps {
  center: Vector3
  normal: Vector3
  basisU: Vector3
  basisV: Vector3
  radius: number
  opacity: number
}

function FacePolygon({ points, color, opacity = 1 }: FacePolygonProps) {
  const geometry = useMemo(() => {
    const positions = points.flatMap((point) => [point.x, point.y, point.z])
    const indices: number[] = []

    for (let index = 1; index < points.length - 1; index += 1) {
      indices.push(0, index, index + 1)
    }

    return { positions, indices }
  }, [points])

  return (
    <mesh renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array(geometry.positions), 3]}
        />
        <bufferAttribute attach="index" args={[new Uint16Array(geometry.indices), 1]} />
      </bufferGeometry>
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity >= 1}
        side={DoubleSide}
        metalness={0.08}
        roughness={0.72}
      />
    </mesh>
  )
}

function Polyline({ points, color }: PolylineProps) {
  return <Line points={points} color={color} lineWidth={1.8} renderOrder={3} />
}

function buildCirclePoints(center: Vector3, basisU: Vector3, basisV: Vector3, radius: number) {
  const segments = 96
  const points: Vector3[] = []

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2
    const offset = basisU
      .clone()
      .multiplyScalar(Math.cos(angle) * radius)
      .add(basisV.clone().multiplyScalar(Math.sin(angle) * radius))
    points.push(center.clone().add(offset))
  }

  return points
}

function buildOutlinePoints(points: Vector3[]) {
  return [...points, points[0]]
}

function CoinDisc({ center, normal, basisU, basisV, radius, opacity }: CoinDiscProps) {
  const quaternion = useMemo(() => {
    return new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      normal.clone().normalize(),
    )
  }, [normal])
  const thickness = useMemo(() => Math.max(radius * 0.045, 0.03), [radius])

  const outlinePoints = useMemo(
    () => buildOutlinePoints(buildCirclePoints(center, basisU, basisV, radius)),
    [basisU, basisV, center, radius],
  )

  return (
    <>
      <mesh position={center} quaternion={quaternion} renderOrder={2}>
        <cylinderGeometry args={[radius, radius, thickness, 128, 1, false]} />
        <meshStandardMaterial
          attach="material-0"
          color="#a16207"
          emissive="#5b3b07"
          emissiveIntensity={0.12}
          transparent={opacity < 1}
          opacity={opacity}
          metalness={0.18}
          roughness={0.42}
        />
        <meshStandardMaterial
          attach="material-1"
          color="#facc15"
          emissive="#7c5f10"
          emissiveIntensity={0.18}
          transparent={opacity < 1}
          opacity={opacity}
          metalness={0.05}
          roughness={0.34}
        />
        <meshStandardMaterial
          attach="material-2"
          color="#f8d548"
          emissive="#7c5f10"
          emissiveIntensity={0.18}
          transparent={opacity < 1}
          opacity={opacity}
          metalness={0.05}
          roughness={0.34}
        />
      </mesh>
      <Line points={outlinePoints} color="#fde68a" lineWidth={1.6} renderOrder={4} />
    </>
  )
}

function SceneContent({
  polyhedron,
  keepTree,
  cutTree,
  facePoses,
  coins,
  themeMode,
  renderMode,
  showEdges,
  showKeepTree,
  showCutTree,
}: PolyhedronSceneProps) {
  const edgeIndexByKey = useMemo(
    () =>
      new Map(
        polyhedron.edges.map((edge) => [edgeKey(edge.vertexIndices[0], edge.vertexIndices[1]), edge.index]),
      ),
    [polyhedron.edges],
  )

  const faceWorldPolygons = useMemo(
    () =>
      polyhedron.faces.map((face, faceIndex) =>
        face.vertexIndices.map((vertexIndex) =>
          transformPoint(facePoses[faceIndex], polyhedron.vertices[vertexIndex]),
        ),
      ),
    [facePoses, polyhedron.faces, polyhedron.vertices],
  )

  const cutEdgeSet = useMemo(() => new Set(cutTree.primalEdgeIndices), [cutTree.primalEdgeIndices])

  const keepSegments = useMemo(
    () =>
      keepTree.dualEdgeIndices.flatMap((dualEdgeIndex) => {
        const dualEdge = polyhedron.dualEdges[dualEdgeIndex]
        const primalEdge = polyhedron.edges[dualEdge.primalEdgeIndex]
        const edgeMidpoint = primalEdge.midpoint

        return dualEdge.faceIndices.map((faceIndex) => {
          const face = polyhedron.faces[faceIndex]
          const offsetNormal = face.normal.clone().multiplyScalar(0.025)
          const start = transformPoint(
            facePoses[faceIndex],
            face.centroid.clone().add(offsetNormal),
          )
          const end = transformPoint(
            facePoses[faceIndex],
            edgeMidpoint.clone().add(offsetNormal),
          )

          return [start, end]
        })
      }),
    [facePoses, keepTree.dualEdgeIndices, polyhedron],
  )

  const cutSegments = useMemo(
    () =>
      polyhedron.faces.flatMap((face, faceIndex) => {
        const points = faceWorldPolygons[faceIndex]

        return face.vertexIndices.flatMap((vertexIndex, index) => {
          const nextVertexIndex = face.vertexIndices[(index + 1) % face.vertexIndices.length]
          const key = edgeKey(vertexIndex, nextVertexIndex)
          const edgeIndex = edgeIndexByKey.get(key)

          if (edgeIndex === undefined || !cutEdgeSet.has(edgeIndex)) {
            return []
          }

          return [[points[index], points[(index + 1) % points.length]]] as Vector3[][]
        })
      }),
    [cutEdgeSet, edgeIndexByKey, faceWorldPolygons, polyhedron.faces],
  )

  const coinDiscs = useMemo(
    () =>
      coins.map((coin) => {
        const face = polyhedron.faces[coin.faceIndex]
        const center = transformPoint(
          facePoses[coin.faceIndex],
          coin.center.clone().add(face.normal.clone().multiplyScalar(0.018)),
        )
        const basisUPoint = transformPoint(
          facePoses[coin.faceIndex],
          coin.center.clone().add(face.basisU.clone()),
        )
        const basisVPoint = transformPoint(
          facePoses[coin.faceIndex],
          coin.center.clone().add(face.basisV.clone()),
        )
        const basisU = basisUPoint.sub(center).normalize()
        const basisV = basisVPoint.sub(center).normalize()
        const normalPoint = transformPoint(
          facePoses[coin.faceIndex],
          coin.center.clone().add(face.normal.clone()),
        )
        const normal = normalPoint.sub(center).normalize()

        return {
          faceIndex: coin.faceIndex,
          center,
          basisU,
          basisV,
          normal,
          radius: coin.radius,
        }
      }),
    [coins, facePoses, polyhedron.faces],
  )

  const showFaceMeshes = renderMode !== 'coins-only'
  const showCoinMeshes = renderMode !== 'faces'
  const sceneBackground = themeMode === 'dark' ? '#0f172a' : '#f8fafc'
  const gridMajor = themeMode === 'dark' ? '#334155' : '#cbd5e1'
  const gridMinor = themeMode === 'dark' ? '#1e293b' : '#e2e8f0'

  return (
    <>
      <color attach="background" args={[sceneBackground]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[6, 8, 6]} intensity={2.2} />
      <directionalLight position={[-5, -2, -3]} intensity={0.8} color="#cbd5f5" />

      {showFaceMeshes &&
        faceWorldPolygons.map((points, faceIndex) => (
          <FacePolygon
            key={`face-${faceIndex}`}
            points={points}
            color="#93c5fd"
            opacity={renderMode === 'faces+coins' ? 0.72 : 0.92}
          />
        ))}

      {showCoinMeshes &&
        coinDiscs.map((coin) => (
          <CoinDisc
            key={`coin-${coin.faceIndex}`}
            center={coin.center}
            basisU={coin.basisU}
            basisV={coin.basisV}
            normal={coin.normal}
            radius={coin.radius}
            opacity={renderMode === 'coins-only' ? 0.94 : 0.8}
          />
        ))}

      {showEdges &&
        faceWorldPolygons.map((points, faceIndex) => (
          <Polyline
            key={`outline-${faceIndex}`}
            points={buildOutlinePoints(points)}
            color="#e2e8f0"
          />
        ))}

      {showKeepTree &&
        keepSegments.map((segment, index) => (
          <Polyline key={`keep-${index}`} points={segment} color="#14b8a6" />
        ))}

      {showCutTree &&
        cutSegments.map((segment, index) => (
          <Polyline key={`cut-${index}`} points={segment} color="#fb7185" />
        ))}

      <gridHelper args={[10, 10, gridMajor, gridMinor]} position={[0, -2.8, 0]} />
    </>
  )
}

export const PolyhedronScene = memo(function PolyhedronScene(props: PolyhedronSceneProps) {
  const direction = new Vector3(1, 0.68, 1.04).normalize()
  const [initialView] = useState(() => ({
    target: props.cameraTarget.clone(),
    position: props.cameraTarget
      .clone()
      .add(direction.multiplyScalar(Math.max(6.5, props.cameraDistance)))
      .toArray(),
  }))

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ camera }) => {
        camera.lookAt(initialView.target)
      }}
      camera={{
        fov: 32,
        position: initialView.position,
      }}
    >
      <SceneContent {...props} />
      <ArcballControls
        makeDefault
        enablePan
        enableZoom
        dampingFactor={0.08}
        target={initialView.target}
        minDistance={Math.max(3.5, props.polyhedron.radius * 1.8)}
        maxDistance={Math.max(30, props.polyhedron.radius * 18)}
      />
    </Canvas>
  )
})
