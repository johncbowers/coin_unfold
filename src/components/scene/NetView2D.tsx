import { useMemo, useRef, useState } from 'react'
import type { Matrix4, Vector3 } from 'three'
import { edgeKey, transformPoint } from '../../domain/geometry/polyhedronMath'
import type { CoinData, CutTree, DerivedPolyhedron, KeepTree, RenderMode } from '../../types/polyhedron'

interface Point2D {
  x: number
  y: number
}

interface ViewBoxState {
  minX: number
  minY: number
  width: number
  height: number
}

interface ViewBoxOverrideState {
  signature: string
  viewBox: ViewBoxState
}

interface NetView2DProps {
  polyhedron: DerivedPolyhedron
  keepTree: KeepTree
  cutTree: CutTree
  facePoses: Matrix4[]
  coins: CoinData[]
  themeMode: 'light' | 'dark'
  exportFileName: string
  renderMode: RenderMode
  showEdges: boolean
  showKeepTree: boolean
  showCutTree: boolean
}

function projectPoint(
  point: Vector3,
  origin: Vector3,
  basisU: Vector3,
  basisV: Vector3,
): Point2D {
  const offset = point.clone().sub(origin)
  return {
    x: offset.dot(basisU),
    y: -offset.dot(basisV),
  }
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

function pointsToSvg(points: Point2D[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function formatViewBox(viewBox: ViewBoxState) {
  return `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`
}

export function NetView2D({
  polyhedron,
  keepTree,
  cutTree,
  facePoses,
  coins,
  themeMode,
  exportFileName,
  renderMode,
  showEdges,
  showKeepTree,
  showCutTree,
}: NetView2DProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
    viewBox: ViewBoxState
  } | null>(null)
  const rootFace = polyhedron.faces[keepTree.rootFaceIndex]
  const [viewBoxOverride, setViewBoxOverride] = useState<ViewBoxOverrideState | null>(null)

  const projected = useMemo(() => {
    const edgeIndexByKey = new Map(
      polyhedron.edges.map((edge) => [edgeKey(edge.vertexIndices[0], edge.vertexIndices[1]), edge.index]),
    )
    const cutEdgeSet = new Set(cutTree.primalEdgeIndices)

    const facePolygons = polyhedron.faces.map((face, faceIndex) => {
      const worldPoints = face.vertexIndices.map((vertexIndex) =>
        transformPoint(facePoses[faceIndex], polyhedron.vertices[vertexIndex]),
      )

      return worldPoints.map((point) =>
        projectPoint(point, rootFace.centroid, rootFace.basisU, rootFace.basisV),
      )
    })

    const keepSegments = keepTree.dualEdgeIndices.flatMap((dualEdgeIndex) => {
      const dualEdge = polyhedron.dualEdges[dualEdgeIndex]
      const primalEdge = polyhedron.edges[dualEdge.primalEdgeIndex]
      const edgeMidpoint = primalEdge.midpoint

      return dualEdge.faceIndices.map((faceIndex) => {
        const face = polyhedron.faces[faceIndex]
        const start = projectPoint(
          transformPoint(facePoses[faceIndex], face.centroid),
          rootFace.centroid,
          rootFace.basisU,
          rootFace.basisV,
        )
        const end = projectPoint(
          transformPoint(facePoses[faceIndex], edgeMidpoint),
          rootFace.centroid,
          rootFace.basisU,
          rootFace.basisV,
        )

        return [start, end]
      })
    })

    const cutSegments = polyhedron.faces.flatMap((face, faceIndex) => {
      const polygon = facePolygons[faceIndex]

      return face.vertexIndices.flatMap((vertexIndex, index) => {
        const nextVertexIndex = face.vertexIndices[(index + 1) % face.vertexIndices.length]
        const edgeIndex = edgeIndexByKey.get(edgeKey(vertexIndex, nextVertexIndex))

        if (edgeIndex === undefined || !cutEdgeSet.has(edgeIndex)) {
          return []
        }

        return [[polygon[index], polygon[(index + 1) % polygon.length]]]
      })
    })

    const coinPolygons = coins.map((coin) => {
      const face = polyhedron.faces[coin.faceIndex]
      const center = transformPoint(facePoses[coin.faceIndex], coin.center)
      const basisUPoint = transformPoint(facePoses[coin.faceIndex], coin.center.clone().add(face.basisU))
      const basisVPoint = transformPoint(facePoses[coin.faceIndex], coin.center.clone().add(face.basisV))
      const basisU = basisUPoint.sub(center).normalize()
      const basisV = basisVPoint.sub(center).normalize()
      const worldPoints = buildCirclePoints(center, basisU, basisV, coin.radius)

      return {
        faceIndex: coin.faceIndex,
        points: worldPoints.map((point) =>
          projectPoint(point, rootFace.centroid, rootFace.basisU, rootFace.basisV),
        ),
      }
    })

    const allPoints = [
      ...facePolygons.flat(),
      ...keepSegments.flat(),
      ...cutSegments.flat(),
      ...coinPolygons.flatMap((coin) => coin.points),
    ]

    const bounds = allPoints.reduce(
      (accumulator, point) => ({
        minX: Math.min(accumulator.minX, point.x),
        maxX: Math.max(accumulator.maxX, point.x),
        minY: Math.min(accumulator.minY, point.y),
        maxY: Math.max(accumulator.maxY, point.y),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    )

    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    const paddingX = width * 0.05
    const paddingY = height * 0.08
    const initialViewBox = {
      minX: bounds.minX - paddingX,
      minY: bounds.minY - paddingY,
      width: width + paddingX * 2,
      height: height + paddingY * 2,
    }

    return {
      facePolygons,
      keepSegments,
      cutSegments,
      coinPolygons,
      initialViewBox,
    }
  }, [
    coins,
    cutTree.primalEdgeIndices,
    facePoses,
    keepTree.dualEdgeIndices,
    polyhedron,
    rootFace.basisU,
    rootFace.basisV,
    rootFace.centroid,
  ])
  const viewBoxSignature = useMemo(
    () => formatViewBox(projected.initialViewBox),
    [projected.initialViewBox],
  )
  const activeViewBox = viewBoxOverride?.signature === viewBoxSignature
    ? viewBoxOverride.viewBox
    : projected.initialViewBox

  const showFaceMeshes = renderMode !== 'coins-only'
  const showCoinMeshes = renderMode !== 'faces'
  const palette = themeMode === 'dark'
    ? {
        background: '#020617',
        face: '#93c5fd',
        edge: '#f8fafc',
        coin: '#facc15',
        coinStroke: '#a16207',
        keep: '#14b8a6',
        cut: '#f43f5e',
      }
    : {
        background: '#ffffff',
        face: '#60a5fa',
        edge: '#0f172a',
        coin: '#facc15',
        coinStroke: '#a16207',
        keep: '#0f766e',
        cut: '#dc2626',
      }

  const downloadSvg = () => {
    const svgElement = svgRef.current

    if (!svgElement) {
      return
    }

    const clone = svgElement.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('version', '1.1')

    const viewBox = clone.viewBox.baseVal
    const exportWidth = 2400
    const exportHeight = Math.max(1200, Math.round((viewBox.height / viewBox.width) * exportWidth))

    clone.setAttribute('width', String(exportWidth))
    clone.setAttribute('height', String(exportHeight))

    const serializer = new XMLSerializer()
    const markup = serializer.serializeToString(clone)
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = exportFileName
    link.click()
    URL.revokeObjectURL(url)
  }

  const projectClientPoint = (clientX: number, clientY: number) => {
    const svgElement = svgRef.current

    if (!svgElement) {
      return null
    }

    const bounds = svgElement.getBoundingClientRect()
    const x = ((clientX - bounds.left) / bounds.width) * activeViewBox.width + activeViewBox.minX
    const y = ((clientY - bounds.top) / bounds.height) * activeViewBox.height + activeViewBox.minY

    return { x, y }
  }

  const handlePointerDown: React.PointerEventHandler<SVGSVGElement> = (event) => {
    dragStateRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      viewBox: activeViewBox,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove: React.PointerEventHandler<SVGSVGElement> = (event) => {
    const dragState = dragStateRef.current

    if (dragState?.pointerId !== event.pointerId) {
      return
    }

    const svgElement = svgRef.current

    if (!svgElement) {
      return
    }

    const bounds = svgElement.getBoundingClientRect()
    const deltaClientX = event.clientX - dragState.clientX
    const deltaClientY = event.clientY - dragState.clientY
    const worldDeltaX = (deltaClientX / bounds.width) * dragState.viewBox.width
    const worldDeltaY = (deltaClientY / bounds.height) * dragState.viewBox.height

    setViewBoxOverride({
      signature: viewBoxSignature,
      viewBox: {
        ...dragState.viewBox,
        minX: dragState.viewBox.minX - worldDeltaX,
        minY: dragState.viewBox.minY - worldDeltaY,
      },
    })
  }

  const clearDrag = (event?: React.PointerEvent<SVGSVGElement>) => {
    if (event && dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    dragStateRef.current = null
  }

  const handleWheel: React.WheelEventHandler<SVGSVGElement> = (event) => {
    event.preventDefault()

    const focalPoint = projectClientPoint(event.clientX, event.clientY)

    if (!focalPoint) {
      return
    }

    const zoomFactor = event.deltaY > 0 ? 1.12 : 0.88
    const nextWidth = Math.max(projected.initialViewBox.width * 0.18, activeViewBox.width * zoomFactor)
    const nextHeight = Math.max(projected.initialViewBox.height * 0.18, activeViewBox.height * zoomFactor)
    const maxWidth = projected.initialViewBox.width * 4
    const maxHeight = projected.initialViewBox.height * 4
    const clampedWidth = Math.min(maxWidth, nextWidth)
    const clampedHeight = Math.min(maxHeight, nextHeight)
    const ratioX = (focalPoint.x - activeViewBox.minX) / activeViewBox.width
    const ratioY = (focalPoint.y - activeViewBox.minY) / activeViewBox.height

    setViewBoxOverride({
      signature: viewBoxSignature,
      viewBox: {
        minX: focalPoint.x - clampedWidth * ratioX,
        minY: focalPoint.y - clampedHeight * ratioY,
        width: clampedWidth,
        height: clampedHeight,
      },
    })
  }

  return (
    <div className="net-panel">
      <div className="net-panel-header">
        <h2>2D net view</h2>
        <div className="net-panel-actions">
          <span>Projected to the root-face plane and auto-fitted</span>
          <button type="button" className="net-export-button" onClick={downloadSvg}>
            Download SVG
          </button>
        </div>
      </div>
      <svg
        ref={svgRef}
        className="net-svg"
        viewBox={formatViewBox(activeViewBox)}
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="geometricPrecision"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearDrag}
        onPointerLeave={clearDrag}
        onWheel={handleWheel}
      >
        <rect x="-10000" y="-10000" width="20000" height="20000" fill={palette.background} />

        {showFaceMeshes &&
          projected.facePolygons.map((polygon, index) => (
            <polygon
              key={`net-face-${index}`}
              points={pointsToSvg(polygon)}
              fill={palette.face}
              fillOpacity={renderMode === 'faces+coins' ? 0.7 : 0.9}
              stroke="none"
            />
          ))}

        {showCoinMeshes &&
          projected.coinPolygons.map((coin) => (
            <polygon
              key={`net-coin-${coin.faceIndex}`}
              points={pointsToSvg(coin.points)}
              fill={palette.coin}
              fillOpacity={renderMode === 'coins-only' ? 0.94 : 0.82}
              stroke={palette.coinStroke}
              strokeWidth="1.35px"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

        {showEdges &&
          projected.facePolygons.map((polygon, index) => (
            <polyline
              key={`net-outline-${index}`}
              points={pointsToSvg([...polygon, polygon[0]])}
              fill="none"
              stroke={palette.edge}
              strokeWidth="1.65px"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

        {showKeepTree &&
          projected.keepSegments.map((segment, index) => (
            <line
              key={`net-keep-${index}`}
              x1={segment[0].x}
              y1={segment[0].y}
              x2={segment[1].x}
              y2={segment[1].y}
              stroke={palette.keep}
              strokeWidth="2px"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

        {showCutTree &&
          projected.cutSegments.map((segment, index) => (
            <line
              key={`net-cut-${index}`}
              x1={segment[0].x}
              y1={segment[0].y}
              x2={segment[1].x}
              y2={segment[1].y}
              stroke={palette.cut}
              strokeWidth="2.2px"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

      </svg>
    </div>
  )
}
