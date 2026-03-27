import { Matrix4, Quaternion, Vector3 } from 'three'
import {
  buildRotationAroundAxis,
  clampUnit,
  facePairKey,
  transformPoint,
} from '../geometry/polyhedronMath'
import type { DerivedPolyhedron, KeepTree } from '../../types/polyhedron'

interface FacePoseStep {
  faceIndex: number
  parentFaceIndex: number
  axisStart: Vector3
  axisEnd: Vector3
  signedOpenAngle: number
}

export interface FacePoseRig {
  faceCount: number
  steps: FacePoseStep[]
}

export function prepareFacePoseRig(
  polyhedron: DerivedPolyhedron,
  keepTree: KeepTree,
): FacePoseRig {
  const steps: FacePoseStep[] = []

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

    steps.push({
      faceIndex,
      parentFaceIndex,
      axisStart: polyhedron.vertices[primalEdge.vertexIndices[0]].clone(),
      axisEnd: polyhedron.vertices[primalEdge.vertexIndices[1]].clone(),
      signedOpenAngle:
        determineRotationSign(polyhedron, parentFaceIndex, faceIndex, dualEdgeIndex)
        * dualEdge.openAngle,
    })
  }

  return {
    faceCount: polyhedron.faces.length,
    steps,
  }
}

export function computeFacePoses(
  rig: FacePoseRig,
  unfoldAmount: number,
) {
  const poses = Array.from({ length: rig.faceCount }, () => new Matrix4().identity())

  for (const step of rig.steps) {
    const parentMatrix = poses[step.parentFaceIndex].clone()
    const axisStart = transformPoint(parentMatrix, step.axisStart)
    const axisEnd = transformPoint(parentMatrix, step.axisEnd)
    const signedAngle = step.signedOpenAngle * unfoldAmount
    const hingeRotation = buildRotationAroundAxis(axisStart, axisEnd, signedAngle)

    poses[step.faceIndex] = hingeRotation.multiply(parentMatrix)
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
