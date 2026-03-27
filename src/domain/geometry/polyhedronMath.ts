import { Matrix4, Quaternion, Vector3 } from 'three'
import type { RawPolyhedron } from '../../types/polyhedron'

const EPSILON = 1e-8

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

export function buildFaceBasis(points: Vector3[], normal: Vector3) {
  const basisU = points[1].clone().sub(points[0]).normalize()
  const basisV = normal.clone().cross(basisU).normalize()

  return { basisU, basisV }
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
