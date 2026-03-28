import { Matrix4, Quaternion, Vector3 } from 'three'
import type { RawPolyhedron } from '../../types/polyhedron'

const EPSILON = 1e-8

interface Point2D {
  x: number
  y: number
}

interface LineConstraint2D {
  a: number
  b: number
  c: number
  rhs: number
  inward: Point2D
}

export interface FaceIncircleSolution {
  center2D: Point2D | null
  center3D: Vector3 | null
  radius: number | null
  maxResidual: number
  maxSegmentError: number
  tangencyParameters: number[]
  isTangential: boolean
}

export function toVector3(tuple: [number, number, number]) {
  return new Vector3(tuple[0], tuple[1], tuple[2])
}

export function cloneFace(face: number[]) {
  return [...face]
}

export function computeCentroid(points: Vector3[]) {
  const centroid = new Vector3()

  for (const point of points) {
    centroid.add(point)
  }

  return centroid.divideScalar(points.length)
}

export function computeFaceNormal(points: Vector3[]) {
  const centroid = computeCentroid(points)
  const normal = new Vector3()

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    normal.x += (current.y - next.y) * (current.z + next.z)
    normal.y += (current.z - next.z) * (current.x + next.x)
    normal.z += (current.x - next.x) * (current.y + next.y)
  }

  if (normal.lengthSq() < EPSILON) {
    const edgeA = points[1].clone().sub(points[0])
    const edgeB = centroid.clone().sub(points[0])
    normal.copy(edgeA.cross(edgeB))
  }

  return normal.normalize()
}

export function orientFacesOutward(raw: RawPolyhedron) {
  const vertices = raw.vertices.map(toVector3)
  const polyhedronCenter = computeCentroid(vertices)

  const faces = raw.faces.map((face) => {
    const candidate = cloneFace(face)
    const points = candidate.map((vertexIndex) => vertices[vertexIndex])
    const centroid = computeCentroid(points)
    const normal = computeFaceNormal(points)

    if (normal.dot(centroid.clone().sub(polyhedronCenter)) < 0) {
      candidate.reverse()
    }

    return candidate
  })

  return {
    ...raw,
    faces,
  }
}

export function scaleRawPolyhedron(raw: RawPolyhedron, targetRadius = 1.75): RawPolyhedron {
  const vertices = raw.vertices.map(toVector3)
  const radius = Math.max(...vertices.map((vertex) => vertex.length()))
  const scale = targetRadius / radius

  return {
    ...raw,
    vertices: raw.vertices.map(([x, y, z]) => [x * scale, y * scale, z * scale]),
  }
}

export function buildDualRawPolyhedron(sourceRaw: RawPolyhedron, dualId: string, dualName: string): RawPolyhedron {
  const source = orientFacesOutward(sourceRaw)
  const sourceVertices = source.vertices.map(toVector3)
  const sourceFaceCentroids = source.faces.map((face) =>
    computeCentroid(face.map((vertexIndex) => sourceVertices[vertexIndex])),
  )

  const dualVertices = sourceFaceCentroids.map((centroid) =>
    [centroid.x, centroid.y, centroid.z] as [number, number, number],
  )

  const dualFaces = sourceVertices.map((vertex, vertexIndex) => {
    const incidentFaceIndices = source.faces
      .map((face, faceIndex) => ({ face, faceIndex }))
      .filter(({ face }) => face.includes(vertexIndex))
      .map(({ faceIndex }) => faceIndex)

    const axis = vertex.clone().normalize()
    const tangentSeed = Math.abs(axis.y) < 0.9
      ? new Vector3(0, 1, 0)
      : new Vector3(1, 0, 0)
    const basisU = tangentSeed.clone().cross(axis).normalize()
    const basisV = axis.clone().cross(basisU).normalize()

    return incidentFaceIndices
      .map((faceIndex) => {
        const offset = sourceFaceCentroids[faceIndex].clone().sub(vertex)
        const projected = offset.sub(axis.clone().multiplyScalar(offset.dot(axis)))
        const angle = Math.atan2(projected.dot(basisV), projected.dot(basisU))
        return { faceIndex, angle }
      })
      .sort((left, right) => left.angle - right.angle)
      .map(({ faceIndex }) => faceIndex)
  })

  return {
    id: dualId,
    name: dualName,
    vertices: dualVertices,
    faces: dualFaces,
  }
}

export function buildFaceBasis(points: Vector3[], normal: Vector3) {
  const basisU = points[1].clone().sub(points[0]).normalize()
  const basisV = normal.clone().cross(basisU).normalize()

  return { basisU, basisV }
}

export function computeFaceIncircle(
  points3D: Vector3[],
  planeOrigin: Vector3,
  basisU: Vector3,
  basisV: Vector3,
): FaceIncircleSolution {
  const points2D = points3D.map((point) => {
    const offset = point.clone().sub(planeOrigin)
    return {
      x: offset.dot(basisU),
      y: offset.dot(basisV),
    }
  })
  const signedArea = computeSignedArea(points2D)
  const orientation = signedArea >= 0 ? 1 : -1
  const rows: LineConstraint2D[] = []

  for (let index = 0; index < points2D.length; index += 1) {
    const current = points2D[index]
    const next = points2D[(index + 1) % points2D.length]
    const dx = next.x - current.x
    const dy = next.y - current.y
    const edgeLength = Math.hypot(dx, dy)

    if (edgeLength < EPSILON) {
      return invalidFaceIncircleSolution()
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
    return invalidFaceIncircleSolution()
  }

  const [centerX, centerY, radius] = solution
  const center2D = { x: centerX, y: centerY }
  const center3D = planeOrigin.clone()
    .add(basisU.clone().multiplyScalar(centerX))
    .add(basisV.clone().multiplyScalar(centerY))
  const maxResidual = rows.reduce((maximum, row) => {
    const signedDistance = row.a * centerX + row.b * centerY - row.rhs
    return Math.max(maximum, Math.abs(signedDistance - radius))
  }, 0)

  const tangencyParameters: number[] = []
  let maxSegmentError = 0

  for (let index = 0; index < rows.length; index += 1) {
    const current = points2D[index]
    const next = points2D[(index + 1) % points2D.length]
    const tangentPoint = {
      x: center2D.x - rows[index].inward.x * radius,
      y: center2D.y - rows[index].inward.y * radius,
    }
    const edgeVector = {
      x: next.x - current.x,
      y: next.y - current.y,
    }
    const edgeLengthSq = edgeVector.x * edgeVector.x + edgeVector.y * edgeVector.y

    if (edgeLengthSq < EPSILON) {
      return invalidFaceIncircleSolution()
    }

    const t = (
      ((tangentPoint.x - current.x) * edgeVector.x) + ((tangentPoint.y - current.y) * edgeVector.y)
    ) / edgeLengthSq
    tangencyParameters.push(t)
    maxSegmentError = Math.max(maxSegmentError, Math.max(0, -t, t - 1))
  }

  const faceScale = averageEdgeLength(points3D)
  const residualTolerance = Math.max(1e-5, faceScale * 1e-4)
  const segmentTolerance = 1e-4

  return {
    center2D,
    center3D,
    radius,
    maxResidual,
    maxSegmentError,
    tangencyParameters,
    isTangential: radius > residualTolerance
      && maxResidual <= residualTolerance
      && maxSegmentError <= segmentTolerance,
  }
}

export function distancePointToLine(point: Vector3, lineA: Vector3, lineB: Vector3) {
  const direction = lineB.clone().sub(lineA)
  const lengthSq = direction.lengthSq()

  if (lengthSq < EPSILON) {
    return point.distanceTo(lineA)
  }

  const projection = point
    .clone()
    .sub(lineA)
    .dot(direction) / lengthSq

  const closest = lineA.clone().add(direction.multiplyScalar(projection))
  return point.distanceTo(closest)
}

export function computeSharedEdgeGeodesicPoint(
  pointA: Vector3,
  pointB: Vector3,
  edgeStart: Vector3,
  edgeEnd: Vector3,
) {
  const edgeVector = edgeEnd.clone().sub(edgeStart)
  const edgeLength = edgeVector.length()

  if (edgeLength < EPSILON) {
    return edgeStart.clone()
  }

  const edgeDirection = edgeVector.clone().divideScalar(edgeLength)
  const uA = pointA.clone().sub(edgeStart).dot(edgeDirection)
  const uB = pointB.clone().sub(edgeStart).dot(edgeDirection)
  const projectionA = edgeStart.clone().add(edgeDirection.clone().multiplyScalar(uA))
  const projectionB = edgeStart.clone().add(edgeDirection.clone().multiplyScalar(uB))
  const hA = pointA.distanceTo(projectionA)
  const hB = pointB.distanceTo(projectionB)
  const weightSum = hA + hB

  if (weightSum < EPSILON) {
    return edgeStart.clone().add(edgeVector.multiplyScalar(0.5))
  }

  const edgeCoordinate = Math.min(
    edgeLength,
    Math.max(0, ((hB * uA) + (hA * uB)) / weightSum),
  )

  return edgeStart.clone().add(edgeDirection.multiplyScalar(edgeCoordinate))
}

export function buildRotationAroundAxis(axisStart: Vector3, axisEnd: Vector3, angle: number) {
  const axis = axisEnd.clone().sub(axisStart).normalize()
  const quaternion = new Quaternion().setFromAxisAngle(axis, angle)
  const translationToOrigin = new Matrix4().makeTranslation(
    -axisStart.x,
    -axisStart.y,
    -axisStart.z,
  )
  const translationBack = new Matrix4().makeTranslation(
    axisStart.x,
    axisStart.y,
    axisStart.z,
  )
  const rotation = new Matrix4().makeRotationFromQuaternion(quaternion)

  return translationBack.multiply(rotation).multiply(translationToOrigin)
}

export function transformPoint(matrix: Matrix4, point: Vector3) {
  return point.clone().applyMatrix4(matrix)
}

export function edgeKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

export function facePairKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

export function clampUnit(value: number) {
  return Math.min(1, Math.max(-1, value))
}

function invalidFaceIncircleSolution(): FaceIncircleSolution {
  return {
    center2D: null,
    center3D: null,
    radius: null,
    maxResidual: Number.POSITIVE_INFINITY,
    maxSegmentError: Number.POSITIVE_INFINITY,
    tangencyParameters: [],
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

function solveLeastSquares3x3(rows: LineConstraint2D[]) {
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

    if (Math.abs(augmented[bestRow][pivotIndex]) < EPSILON) {
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
