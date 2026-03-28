import { Vector3 } from 'three'
import { clampUnit, facePairKey, transformPoint } from '../geometry/polyhedronMath'
import type { DerivedPolyhedron, KeepTree } from '../../types/polyhedron'
import type { Matrix4 } from 'three'

interface Point2D {
  x: number
  y: number
}

interface FaceSphereData {
  pole: Vector3
  sphericalRadius: number
}

export interface InversiveDistancePairAnalysis {
  faceIndices: [number, number]
  spherical: number
  planar: number
  delta: number
  overlapsInPlane: boolean
}

export interface InversiveDistanceAnalysis {
  isAvailable: boolean
  isInversiveExpansive: boolean
  pairCount: number
  increasedPairCount: number
  decreasedPairCount: number
  overlapPairCount: number
  overlapFacePairs: Array<[number, number]>
  overlapFaceIndices: number[]
  maxDecrease: number
  minDelta: number
  minPlanarInversiveDistance: number
  midsphereRadius: number | null
  midsphereFitResidual: number
  pairAnalyses: InversiveDistancePairAnalysis[]
}

const DELTA_TOLERANCE = 1e-5
const OVERLAP_TOLERANCE = 1e-5

export function analyzeInversiveDistances(
  polyhedron: DerivedPolyhedron,
  keepTree: KeepTree,
  netFacePoses: Matrix4[],
): InversiveDistanceAnalysis {
  const tangencyPoints = polyhedron.edges.map((edge) => {
    const face = polyhedron.faces[edge.faceIndices[0]]
    const edgeStart = polyhedron.vertices[edge.vertexIndices[0]]
    const edgeEnd = polyhedron.vertices[edge.vertexIndices[1]]
    return projectPointToEdgeLine(face.incenter, edgeStart, edgeEnd)
  })
  const midsphere = fitSphereToPoints(tangencyPoints)

  if (!midsphere) {
    return {
      isAvailable: false,
      isInversiveExpansive: false,
      pairCount: 0,
      increasedPairCount: 0,
      decreasedPairCount: 0,
      overlapPairCount: 0,
      overlapFacePairs: [],
      overlapFaceIndices: [],
      maxDecrease: 0,
      minDelta: 0,
      minPlanarInversiveDistance: Number.POSITIVE_INFINITY,
      midsphereRadius: null,
      midsphereFitResidual: Number.POSITIVE_INFINITY,
      pairAnalyses: [],
    }
  }

  const faceSphereData = polyhedron.faces.map((face) => {
    const signedDistance = face.normal.dot(face.incenter.clone().sub(midsphere.center))
    const pole = (signedDistance >= 0 ? face.normal : face.normal.clone().negate()).clone().normalize()
    const planeDistance = Math.abs(signedDistance)
    const sphericalRadius = Math.acos(clampUnit(planeDistance / midsphere.radius))

    return {
      pole,
      sphericalRadius,
    } satisfies FaceSphereData
  })

  const rootFace = polyhedron.faces[keepTree.rootFaceIndex]
  const planarCenters = polyhedron.faces.map((face, faceIndex) =>
    projectPointToRootPlane(
      transformPoint(netFacePoses[faceIndex], face.incenter),
      rootFace.centroid,
      rootFace.basisU,
      rootFace.basisV,
    ),
  )
  const keepAdjacency = new Set(
    keepTree.dualEdgeIndices.map((dualEdgeIndex) => {
      const [faceA, faceB] = polyhedron.dualEdges[dualEdgeIndex].faceIndices
      return facePairKey(faceA, faceB)
    }),
  )

  const pairAnalyses: InversiveDistancePairAnalysis[] = []

  for (let faceA = 0; faceA < polyhedron.faces.length; faceA += 1) {
    for (let faceB = faceA + 1; faceB < polyhedron.faces.length; faceB += 1) {
      if (keepAdjacency.has(facePairKey(faceA, faceB))) {
        continue
      }

      const spherical = computeSphericalInversiveDistance(faceSphereData[faceA], faceSphereData[faceB])
      const planar = computePlanarInversiveDistance(
        planarCenters[faceA],
        polyhedron.faces[faceA].inradius,
        planarCenters[faceB],
        polyhedron.faces[faceB].inradius,
      )
      const delta = planar - spherical

      pairAnalyses.push({
        faceIndices: [faceA, faceB],
        spherical,
        planar,
        delta,
        overlapsInPlane: planar < 1 - OVERLAP_TOLERANCE,
      })
    }
  }

  const increasedPairCount = pairAnalyses.filter((pair) => pair.delta > DELTA_TOLERANCE).length
  const decreasedPairCount = pairAnalyses.filter((pair) => pair.delta < -DELTA_TOLERANCE).length
  const overlapFacePairs = pairAnalyses
    .filter((pair) => pair.overlapsInPlane)
    .map((pair) => pair.faceIndices)
  const overlapFaceIndices = Array.from(
    new Set(overlapFacePairs.flatMap(([faceA, faceB]) => [faceA, faceB])),
  ).sort((left, right) => left - right)
  const minDelta = pairAnalyses.reduce((minimum, pair) => Math.min(minimum, pair.delta), Number.POSITIVE_INFINITY)
  const minPlanarInversiveDistance = pairAnalyses.reduce(
    (minimum, pair) => Math.min(minimum, pair.planar),
    Number.POSITIVE_INFINITY,
  )

  return {
    isAvailable: true,
    isInversiveExpansive: decreasedPairCount === 0,
    pairCount: pairAnalyses.length,
    increasedPairCount,
    decreasedPairCount,
    overlapPairCount: overlapFacePairs.length,
    overlapFacePairs,
    overlapFaceIndices,
    maxDecrease: pairAnalyses.length === 0 ? 0 : Math.max(0, -minDelta),
    minDelta: pairAnalyses.length === 0 ? 0 : minDelta,
    minPlanarInversiveDistance,
    midsphereRadius: midsphere.radius,
    midsphereFitResidual: midsphere.maxResidual,
    pairAnalyses,
  }
}

function computePlanarInversiveDistance(centerA: Point2D, radiusA: number, centerB: Point2D, radiusB: number) {
  const dx = centerA.x - centerB.x
  const dy = centerA.y - centerB.y
  const distanceSq = dx * dx + dy * dy

  return (distanceSq - radiusA * radiusA - radiusB * radiusB) / (2 * radiusA * radiusB)
}

function computeSphericalInversiveDistance(faceA: FaceSphereData, faceB: FaceSphereData) {
  const cosTheta = clampUnit(faceA.pole.dot(faceB.pole))
  const cosRadiusA = Math.cos(faceA.sphericalRadius)
  const cosRadiusB = Math.cos(faceB.sphericalRadius)
  const sinRadiusA = Math.max(1e-8, Math.sin(faceA.sphericalRadius))
  const sinRadiusB = Math.max(1e-8, Math.sin(faceB.sphericalRadius))

  return (cosRadiusA * cosRadiusB - cosTheta) / (sinRadiusA * sinRadiusB)
}

function projectPointToRootPlane(point: Vector3, origin: Vector3, basisU: Vector3, basisV: Vector3): Point2D {
  const offset = point.clone().sub(origin)
  return {
    x: offset.dot(basisU),
    y: -offset.dot(basisV),
  }
}

function projectPointToEdgeLine(point: Vector3, edgeStart: Vector3, edgeEnd: Vector3) {
  const direction = edgeEnd.clone().sub(edgeStart)
  const lengthSq = direction.lengthSq()

  if (lengthSq < 1e-8) {
    return edgeStart.clone()
  }

  const t = point.clone().sub(edgeStart).dot(direction) / lengthSq
  return edgeStart.clone().add(direction.multiplyScalar(t))
}

function fitSphereToPoints(points: Vector3[]) {
  if (points.length < 4) {
    return null
  }

  const anchor = points[0]
  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const vector = [0, 0, 0]

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    const row = [
      2 * (point.x - anchor.x),
      2 * (point.y - anchor.y),
      2 * (point.z - anchor.z),
    ]
    const rhs = point.lengthSq() - anchor.lengthSq()

    for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < 3; columnIndex += 1) {
        matrix[rowIndex][columnIndex] += row[rowIndex] * row[columnIndex]
      }
      vector[rowIndex] += row[rowIndex] * rhs
    }
  }

  const centerCoordinates = solve3x3(matrix, vector)

  if (!centerCoordinates) {
    return null
  }

  const center = vectorToPoint(centerCoordinates)
  const distances = points.map((point) => point.distanceTo(center))
  const radius = distances.reduce((sum, value) => sum + value, 0) / distances.length
  const maxResidual = distances.reduce((maximum, value) => Math.max(maximum, Math.abs(value - radius)), 0)

  return {
    center,
    radius,
    maxResidual,
  }
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

    if (Math.abs(augmented[bestRow][pivotIndex]) < 1e-8) {
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

function vectorToPoint([x, y, z]: readonly [number, number, number]) {
  return new Vector3(x, y, z)
}
