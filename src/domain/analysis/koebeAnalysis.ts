import { Vector3 } from 'three'
import { edgeKey } from '../geometry/polyhedronMath'
import type { DerivedPolyhedron } from '../../types/polyhedron'

interface Point2D {
  x: number
  y: number
}

interface FaceIncircleComputation {
  center: Point2D | null
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
    const points2D = points3D.map((point) => {
      const offset = point.clone().sub(face.centroid)
      return {
        x: offset.dot(face.basisU),
        y: offset.dot(face.basisV),
      }
    })

    return computeFaceIncircle(polyhedron, face.index, points2D, points3D, edgeIndexByKey)
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

function computeFaceIncircle(
  polyhedron: DerivedPolyhedron,
  faceIndex: number,
  points2D: Point2D[],
  points3D: Vector3[],
  edgeIndexByKey: Map<string, number>,
): FaceIncircleComputation {
  const signedArea = computeSignedArea(points2D)
  const orientation = signedArea >= 0 ? 1 : -1
  const rows: Array<{ a: number; b: number; c: number; rhs: number; inward: Point2D }> = []
  const face = polyhedron.faces[faceIndex]
  const segmentParameters: Array<{ edgeIndex: number; t: number; tangencyPoint: Vector3 }> = []

  for (let index = 0; index < points2D.length; index += 1) {
    const current = points2D[index]
    const next = points2D[(index + 1) % points2D.length]
    const dx = next.x - current.x
    const dy = next.y - current.y
    const edgeLength = Math.hypot(dx, dy)

    if (edgeLength < 1e-10) {
      return invalidFaceResult()
    }

    const inward = {
      x: orientation * (-dy / edgeLength),
      y: orientation * (dx / edgeLength),
    }

    rows.push({
      a: inward.x,
      b: inward.y,
      c: -1,
      rhs: inward.x * current.x + inward.y * current.y,
      inward,
    })
  }

  const solution = solveLeastSquares3x3(rows)

  if (!solution) {
    return invalidFaceResult()
  }

  const [centerX, centerY, radius] = solution
  const center2D = { x: centerX, y: centerY }
  const maxResidual = rows.reduce((maximum, row) => {
    const distance = row.a * centerX + row.b * centerY - row.rhs
    return Math.max(maximum, Math.abs(distance - radius))
  }, 0)

  let maxSegmentError = 0

  for (let index = 0; index < rows.length; index += 1) {
    const current2D = points2D[index]
    const next2D = points2D[(index + 1) % points2D.length]
    const tangent2D = {
      x: center2D.x - rows[index].inward.x * radius,
      y: center2D.y - rows[index].inward.y * radius,
    }
    const edgeVector2D = {
      x: next2D.x - current2D.x,
      y: next2D.y - current2D.y,
    }
    const edgeLengthSq = edgeVector2D.x * edgeVector2D.x + edgeVector2D.y * edgeVector2D.y
    const t = ((tangent2D.x - current2D.x) * edgeVector2D.x + (tangent2D.y - current2D.y) * edgeVector2D.y) / edgeLengthSq
    const parameterError = Math.max(0, -t, t - 1)
    maxSegmentError = Math.max(maxSegmentError, parameterError)

    const current3D = points3D[index]
    const next3D = points3D[(index + 1) % points3D.length]
    const tangencyPoint = current3D.clone().lerp(next3D, t)
    const edgeIndex = edgeIndexByKey.get(edgeKey(face.vertexIndices[index], face.vertexIndices[(index + 1) % face.vertexIndices.length]))

    if (edgeIndex !== undefined) {
      segmentParameters.push({ edgeIndex, t, tangencyPoint })
    }
  }

  const faceScale = averageEdgeLength(points3D)
  const residualTolerance = Math.max(1e-5, faceScale * 1e-4)
  const segmentTolerance = 1e-4
  const tangencyPointsByEdgeIndex = new Map(
    segmentParameters.map(({ edgeIndex, tangencyPoint }) => [edgeIndex, tangencyPoint]),
  )

  return {
    center: center2D,
    radius,
    maxResidual,
    maxSegmentError,
    tangencyPointsByEdgeIndex,
    isTangential: radius > residualTolerance
      && maxResidual <= residualTolerance
      && maxSegmentError <= segmentTolerance,
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

function computeSignedArea(points: Point2D[]) {
  let area = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }

  return area * 0.5
}

function averageEdgeLength(points: Vector3[]) {
  let total = 0

  for (let index = 0; index < points.length; index += 1) {
    total += points[index].distanceTo(points[(index + 1) % points.length])
  }

  return total / points.length
}

function solveLeastSquares3x3(rows: Array<{ a: number; b: number; c: number; rhs: number }>) {
  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const vector = [0, 0, 0]

  for (const row of rows) {
    matrix[0][0] += row.a * row.a
    matrix[0][1] += row.a * row.b
    matrix[0][2] += row.a * row.c
    matrix[1][0] += row.b * row.a
    matrix[1][1] += row.b * row.b
    matrix[1][2] += row.b * row.c
    matrix[2][0] += row.c * row.a
    matrix[2][1] += row.c * row.b
    matrix[2][2] += row.c * row.c

    vector[0] += row.a * row.rhs
    vector[1] += row.b * row.rhs
    vector[2] += row.c * row.rhs
  }

  return solve3x3(matrix, vector)
}

function solve3x3(matrix: number[][], vector: number[]) {
  const augmented = matrix.map((row, index) => [...row, vector[index]])

  for (let pivotIndex = 0; pivotIndex < 3; pivotIndex += 1) {
    let bestRow = pivotIndex

    for (let rowIndex = pivotIndex + 1; rowIndex < 3; rowIndex += 1) {
      if (Math.abs(augmented[rowIndex][pivotIndex]) > Math.abs(augmented[bestRow][pivotIndex])) {
        bestRow = rowIndex
      }
    }

    if (Math.abs(augmented[bestRow][pivotIndex]) < 1e-10) {
      return null
    }

    if (bestRow !== pivotIndex) {
      ;[augmented[pivotIndex], augmented[bestRow]] = [augmented[bestRow], augmented[pivotIndex]]
    }

    const pivot = augmented[pivotIndex][pivotIndex]

    for (let columnIndex = pivotIndex; columnIndex < 4; columnIndex += 1) {
      augmented[pivotIndex][columnIndex] /= pivot
    }

    for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
      if (rowIndex === pivotIndex) {
        continue
      }

      const factor = augmented[rowIndex][pivotIndex]

      for (let columnIndex = pivotIndex; columnIndex < 4; columnIndex += 1) {
        augmented[rowIndex][columnIndex] -= factor * augmented[pivotIndex][columnIndex]
      }
    }
  }

  return [augmented[0][3], augmented[1][3], augmented[2][3]] as const
}
