import { Vector3 } from 'three'
import { computeFaceIncircle, edgeKey } from '../geometry/polyhedronMath'
import type { DerivedPolyhedron } from '../../types/polyhedron'

interface FaceIncircleComputation {
  center: Vector3 | null
  radius: number | null
  maxResidual: number
  maxSegmentError: number
  tangencyPointsByEdgeIndex: Map<number, Vector3>
  isTangential: boolean
}

export interface KoebeFaceAnalysis {
  faceIndex: number
  isTangential: boolean
  radius: number | null
  maxResidual: number
  maxSegmentError: number
}

export interface KoebeEdgeAnalysis {
  edgeIndex: number
  faceIndices: [number, number]
  isCommonTouchPoint: boolean
  separation: number
}

export interface KoebeAnalysis {
  isKoebe: boolean
  validFaceCount: number
  validEdgeCount: number
  faceAnalyses: KoebeFaceAnalysis[]
  edgeAnalyses: KoebeEdgeAnalysis[]
  invalidFaceIndices: number[]
  invalidEdgeIndices: number[]
  maxFaceResidual: number
  maxEdgeSeparation: number
}

export function analyzeKoebePolyhedron(polyhedron: DerivedPolyhedron): KoebeAnalysis {
  const edgeIndexByKey = new Map(
    polyhedron.edges.map((edge) => [edgeKey(edge.vertexIndices[0], edge.vertexIndices[1]), edge.index]),
  )

  const faceComputations = polyhedron.faces.map((face) => {
    const points3D = face.vertexIndices.map((vertexIndex) => polyhedron.vertices[vertexIndex])

    return computeFaceIncircleDiagnostics(polyhedron, face.index, points3D, edgeIndexByKey)
  })

  const faceAnalyses: KoebeFaceAnalysis[] = faceComputations.map((result, faceIndex) => ({
    faceIndex,
    isTangential: result.isTangential,
    radius: result.radius,
    maxResidual: result.maxResidual,
    maxSegmentError: result.maxSegmentError,
  }))

  const edgeAnalyses: KoebeEdgeAnalysis[] = polyhedron.edges.map((edge) => {
    const [faceA, faceB] = edge.faceIndices
    const faceResultA = faceComputations[faceA]
    const faceResultB = faceComputations[faceB]
    const tangencyA = faceResultA.tangencyPointsByEdgeIndex.get(edge.index)
    const tangencyB = faceResultB.tangencyPointsByEdgeIndex.get(edge.index)
    const edgeLength = polyhedron.vertices[edge.vertexIndices[0]].distanceTo(polyhedron.vertices[edge.vertexIndices[1]])
    const tolerance = Math.max(1e-5, edgeLength * 1e-4)
    const separation = tangencyA && tangencyB ? tangencyA.distanceTo(tangencyB) : Number.POSITIVE_INFINITY

    return {
      edgeIndex: edge.index,
      faceIndices: edge.faceIndices,
      isCommonTouchPoint:
        faceResultA.isTangential
        && faceResultB.isTangential
        && tangencyA !== undefined
        && tangencyB !== undefined
        && separation <= tolerance,
      separation,
    }
  })

  const invalidFaceIndices = faceAnalyses
    .filter((analysis) => !analysis.isTangential)
    .map((analysis) => analysis.faceIndex)
  const invalidEdgeIndices = edgeAnalyses
    .filter((analysis) => !analysis.isCommonTouchPoint)
    .map((analysis) => analysis.edgeIndex)

  return {
    isKoebe: invalidFaceIndices.length === 0 && invalidEdgeIndices.length === 0,
    validFaceCount: faceAnalyses.length - invalidFaceIndices.length,
    validEdgeCount: edgeAnalyses.length - invalidEdgeIndices.length,
    faceAnalyses,
    edgeAnalyses,
    invalidFaceIndices,
    invalidEdgeIndices,
    maxFaceResidual: Math.max(...faceAnalyses.map((analysis) => analysis.maxResidual), 0),
    maxEdgeSeparation: Math.max(
      ...edgeAnalyses.map((analysis) => (Number.isFinite(analysis.separation) ? analysis.separation : 0)),
      0,
    ),
  }
}

function computeFaceIncircleDiagnostics(
  polyhedron: DerivedPolyhedron,
  faceIndex: number,
  points3D: Vector3[],
  edgeIndexByKey: Map<string, number>,
): FaceIncircleComputation {
  const face = polyhedron.faces[faceIndex]
  const incircle = computeFaceIncircle(points3D, face.centroid, face.basisU, face.basisV)

  if (!incircle.center3D || incircle.radius === null) {
    return invalidFaceResult()
  }

  const segmentParameters: Array<{ edgeIndex: number; t: number; tangencyPoint: Vector3 }> = []

  for (let index = 0; index < incircle.tangencyParameters.length; index += 1) {
    const t = incircle.tangencyParameters[index]

    const current3D = points3D[index]
    const next3D = points3D[(index + 1) % points3D.length]
    const tangencyPoint = current3D.clone().lerp(next3D, t)
    const edgeIndex = edgeIndexByKey.get(edgeKey(face.vertexIndices[index], face.vertexIndices[(index + 1) % face.vertexIndices.length]))

    if (edgeIndex !== undefined) {
      segmentParameters.push({ edgeIndex, t, tangencyPoint })
    }
  }

  const tangencyPointsByEdgeIndex = new Map(
    segmentParameters.map(({ edgeIndex, tangencyPoint }) => [edgeIndex, tangencyPoint]),
  )

  return {
    center: incircle.center3D,
    radius: incircle.radius,
    maxResidual: incircle.maxResidual,
    maxSegmentError: incircle.maxSegmentError,
    tangencyPointsByEdgeIndex,
    isTangential: incircle.isTangential,
  }
}

function invalidFaceResult(): FaceIncircleComputation {
  return {
    center: null,
    radius: null,
    maxResidual: Number.POSITIVE_INFINITY,
    maxSegmentError: Number.POSITIVE_INFINITY,
    tangencyPointsByEdgeIndex: new Map(),
    isTangential: false,
  }
}

