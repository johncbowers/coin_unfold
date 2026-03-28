import { ArcballControls, Line } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { memo, useMemo, useState } from 'react'
import { DoubleSide, Matrix4, Quaternion, Vector3 } from 'three'
import { computeSharedEdgeGeodesicPoint, edgeKey } from '../../domain/geometry/polyhedronMath'
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
  transform: Matrix4
  color: string
  opacity?: number
}

interface PolylineProps {
  points: Vector3[]
  color: string
  transform?: Matrix4
}

interface CoinDiscProps {
  center: Vector3
  normal: Vector3
  basisU: Vector3
  basisV: Vector3
  radius: number
  opacity: number
  transform: Matrix4
}

function FacePolygon({ points, transform, color, opacity = 1 }: FacePolygonProps) {
  const geometry = useMemo(() => {
    const positions = points.flatMap((point) => [point.x, point.y, point.z])
    const indices: number[] = []

    for (let index = 1; index < points.length - 1; index += 1) {
      indices.push(0, index, index + 1)
    }

    return { positions, indices }
  }, [points])

  return (
    <mesh matrixAutoUpdate={false} matrix={transform} renderOrder={1} frustumCulled={false}>
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

function Polyline({ points, color, transform }: PolylineProps) {
  return (
    <Line
      points={points}
      color={color}
      lineWidth={1.8}
      renderOrder={3}
      matrixAutoUpdate={false}
      matrix={transform}
      frustumCulled={false}
    />
  )
}

function buildCirclePoints(center: Vector3, basisU: Vector3, basisV: Vector3, radius: number) {
  const segments = 64
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

function CoinDisc({ center, normal, basisU, basisV, radius, opacity, transform }: CoinDiscProps) {
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
    <group matrixAutoUpdate={false} matrix={transform}>
      <mesh position={center} quaternion={quaternion} renderOrder={2} frustumCulled={false}>
        <cylinderGeometry args={[radius, radius, thickness, 64, 1, false]} />
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
      <Line
        points={outlinePoints}
        color="#fde68a"
        lineWidth={1.6}
        renderOrder={4}
        frustumCulled={false}
      />
    </group>
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
  const staticSceneData = useMemo(() => {
    const edgeIndexByKey = new Map(
      polyhedron.edges.map((edge) => [edgeKey(edge.vertexIndices[0], edge.vertexIndices[1]), edge.index]),
    )
    const cutEdgeSet = new Set(cutTree.primalEdgeIndices)
    const facePolygons = polyhedron.faces.map((face) =>
      face.vertexIndices.map((vertexIndex) => polyhedron.vertices[vertexIndex]),
    )
    const faceOutlines = facePolygons.map((points) => buildOutlinePoints(points))
    const keepSegments = keepTree.dualEdgeIndices.flatMap((dualEdgeIndex) => {
      const dualEdge = polyhedron.dualEdges[dualEdgeIndex]
      const primalEdge = polyhedron.edges[dualEdge.primalEdgeIndex]
      const edgeStart = polyhedron.vertices[primalEdge.vertexIndices[0]]
      const edgeEnd = polyhedron.vertices[primalEdge.vertexIndices[1]]
      const [faceAIndex, faceBIndex] = dualEdge.faceIndices
      const geodesicPoint = computeSharedEdgeGeodesicPoint(
        polyhedron.faces[faceAIndex].incenter,
        polyhedron.faces[faceBIndex].incenter,
        edgeStart,
        edgeEnd,
      )

      return dualEdge.faceIndices.map((faceIndex) => {
        const face = polyhedron.faces[faceIndex]
        const offsetNormal = face.normal.clone().multiplyScalar(0.025)

        return {
          faceIndex,
          points: [
            face.incenter.clone().add(offsetNormal),
            geodesicPoint.clone().add(offsetNormal),
          ],
        }
      })
    })
    const cutSegments = polyhedron.faces.flatMap((face, faceIndex) =>
      face.vertexIndices.flatMap((vertexIndex, index) => {
        const nextVertexIndex = face.vertexIndices[(index + 1) % face.vertexIndices.length]
        const key = edgeKey(vertexIndex, nextVertexIndex)
        const edgeIndex = edgeIndexByKey.get(key)

        if (edgeIndex === undefined || !cutEdgeSet.has(edgeIndex)) {
          return []
        }

        return [{
          faceIndex,
          points: [
            polyhedron.vertices[vertexIndex],
            polyhedron.vertices[nextVertexIndex],
          ],
        }]
      }),
    )
    const coinDiscs = coins.map((coin) => {
      const face = polyhedron.faces[coin.faceIndex]

      return {
        faceIndex: coin.faceIndex,
        center: coin.center.clone().add(face.normal.clone().multiplyScalar(0.018)),
        basisU: face.basisU,
        basisV: face.basisV,
        normal: face.normal,
        radius: coin.radius,
      }
    })

    return {
      facePolygons,
      faceOutlines,
      keepSegments,
      cutSegments,
      coinDiscs,
    }
  }, [coins, cutTree.primalEdgeIndices, keepTree.dualEdgeIndices, polyhedron])

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
        staticSceneData.facePolygons.map((points, faceIndex) => (
          <FacePolygon
            key={`face-${faceIndex}`}
            points={points}
            transform={facePoses[faceIndex]}
            color="#93c5fd"
            opacity={renderMode === 'faces+coins' ? 0.72 : 0.92}
          />
        ))}

      {showCoinMeshes &&
        staticSceneData.coinDiscs.map((coin) => (
          <CoinDisc
            key={`coin-${coin.faceIndex}`}
            center={coin.center}
            basisU={coin.basisU}
            basisV={coin.basisV}
            normal={coin.normal}
            radius={coin.radius}
            opacity={renderMode === 'coins-only' ? 0.94 : 0.8}
            transform={facePoses[coin.faceIndex]}
          />
        ))}

      {showEdges &&
        staticSceneData.faceOutlines.map((points, faceIndex) => (
          <Polyline
            key={`outline-${faceIndex}`}
            points={points}
            color="#e2e8f0"
            transform={facePoses[faceIndex]}
          />
        ))}

      {showKeepTree &&
        staticSceneData.keepSegments.map((segment, index) => (
          <Polyline
            key={`keep-${index}`}
            points={segment.points}
            color="#14b8a6"
            transform={facePoses[segment.faceIndex]}
          />
        ))}

      {showCutTree &&
        staticSceneData.cutSegments.map((segment, index) => (
          <Polyline
            key={`cut-${index}`}
            points={segment.points}
            color="#fb7185"
            transform={facePoses[segment.faceIndex]}
          />
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
        near: 0.01,
        far: Math.max(240, props.cameraDistance * 14),
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
