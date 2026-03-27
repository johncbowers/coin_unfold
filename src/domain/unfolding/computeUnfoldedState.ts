import { Matrix4, Quaternion } from 'three'
import {
  buildRotationAroundAxis,
  clampUnit,
  facePairKey,
  transformPoint,
} from '../geometry/polyhedronMath'
import type { DerivedPolyhedron, KeepTree } from '../../types/polyhedron'

export function computeFacePoses(
  polyhedron: DerivedPolyhedron,
  keepTree: KeepTree,
  unfoldAmount: number,
) {
  const poses = polyhedron.faces.map(() => new Matrix4().identity())

  for (const faceIndex of keepTree.traversalOrder) {
    const parentFaceIndex = keepTree.parentByFace[faceIndex]

    if (parentFaceIndex === null) {
      continue
    }

    const dualEdgeIndex = polyhedron.faceToDualEdge.get(
      facePairKey(parentFaceIndex, faceIndex),
    )!
    const dualEdge = polyhedron.dualEdges[dualEdgeIndex]
    const primalEdge = polyhedron.edges[dualEdge.primalEdgeIndex]
    const parentMatrix = poses[parentFaceIndex].clone()
    const axisStart = transformPoint(parentMatrix, polyhedron.vertices[primalEdge.vertexIndices[0]])
    const axisEnd = transformPoint(parentMatrix, polyhedron.vertices[primalEdge.vertexIndices[1]])
    const signedAngle =
      determineRotationSign(polyhedron, parentFaceIndex, faceIndex, dualEdgeIndex) *
      dualEdge.openAngle *
      unfoldAmount
    const hingeRotation = buildRotationAroundAxis(axisStart, axisEnd, signedAngle)

    poses[faceIndex] = hingeRotation.multiply(parentMatrix)
  }

  return poses
}

function determineRotationSign(
  polyhedron: DerivedPolyhedron,
  parentFaceIndex: number,
  childFaceIndex: number,
  dualEdgeIndex: number,
) {
  const childNormal = polyhedron.faces[childFaceIndex].normal
  const parentNormal = polyhedron.faces[parentFaceIndex].normal
  const primalEdge = polyhedron.edges[polyhedron.dualEdges[dualEdgeIndex].primalEdgeIndex]
  const axis = polyhedron.vertices[primalEdge.vertexIndices[1]]
    .clone()
    .sub(polyhedron.vertices[primalEdge.vertexIndices[0]])
    .normalize()

  const positiveCandidate = childNormal
    .clone()
    .applyQuaternion(new Quaternion().setFromAxisAngle(axis, polyhedron.dualEdges[dualEdgeIndex].openAngle))
  const negativeCandidate = childNormal
    .clone()
    .applyQuaternion(new Quaternion().setFromAxisAngle(axis, -polyhedron.dualEdges[dualEdgeIndex].openAngle))

  const positiveScore = Math.acos(clampUnit(positiveCandidate.dot(parentNormal)))
  const negativeScore = Math.acos(clampUnit(negativeCandidate.dot(parentNormal)))

  return positiveScore <= negativeScore ? 1 : -1
}
