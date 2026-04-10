import { Quaternion, Vector3 } from 'three'
import { computeMidsphereFit } from '../analysis/inversiveDistanceAnalysis'
import { clampUnit, edgeKey, facePairKey } from '../geometry/polyhedronMath'
import type { CutTree, DerivedPolyhedron, KeepTree, TreeMethod } from '../../types/polyhedron'

interface SearchEntry {
  parent: number | null
  face: number
  depth: number
}

interface WeightedDualEdge {
  dualEdgeIndex: number
  weight: number
}

export function buildKeepTree(
  polyhedron: DerivedPolyhedron,
  method: TreeMethod,
  rootFaceIndex: number,
): KeepTree {
  if (method === 'orange-peel') {
    return buildOrangePeelTree(polyhedron, rootFaceIndex)
  }

  if (method === 'tangency-point-geodesic') {
    return buildMidsphereMinimumSpanningTree(polyhedron, rootFaceIndex)
  }

  const parentByFace: Array<number | null> = polyhedron.faces.map(() => null)
  const depthByFace: Array<number | null> = polyhedron.faces.map(() => null)
  const traversalOrder: number[] = []
  const dualEdgeIndices: number[] = []
  buildBagTraversalTree(
    polyhedron,
    method,
    rootFaceIndex,
    parentByFace,
    depthByFace,
    traversalOrder,
    dualEdgeIndices,
  )

  return {
    rootFaceIndex,
    parentByFace,
    depthByFace,
    dualEdgeIndices,
    traversalOrder,
    method,
    usedFallback: false,
  }
}

function buildBagTraversalTree(
  polyhedron: DerivedPolyhedron,
  method: TreeMethod,
  rootFaceIndex: number,
  parentByFace: Array<number | null>,
  depthByFace: Array<number | null>,
  traversalOrder: number[],
  dualEdgeIndices: number[],
) {
  const marked = new Set<number>()
  const bag: SearchEntry[] = [{ parent: null, face: rootFaceIndex, depth: 0 }]

  while (bag.length > 0) {
    const entry = method === 'bfs' ? bag.shift()! : bag.pop()!
    const { parent, face, depth } = entry

    if (marked.has(face)) {
      continue
    }

    marked.add(face)
    depthByFace[face] = depth
    traversalOrder.push(face)

    if (parent !== null) {
      parentByFace[face] = parent
      dualEdgeIndices.push(polyhedron.faceToDualEdge.get(facePairKey(parent, face))!)
    }

    const neighbors = [...polyhedron.faceAdjacency[face]].sort((left, right) => left - right)

    for (const neighbor of neighbors) {
      bag.push({ parent: face, face: neighbor, depth: depth + 1 })
    }
  }
}

function buildOrangePeelTree(
  polyhedron: DerivedPolyhedron,
  rootFaceIndex: number,
): KeepTree {
  const vertexTouchAdjacency = buildVertexTouchAdjacency(polyhedron)
  const depthByFace = buildBreadthFirstDepthByFace(vertexTouchAdjacency, rootFaceIndex)
  const { traversalOrder, parentByFace } = buildOrangePeelWalk(polyhedron, rootFaceIndex, depthByFace)
  const dualEdgeIndices = parentByFace.flatMap((parentFaceIndex, faceIndex) => {
    if (parentFaceIndex === null) {
      return []
    }

    return [polyhedron.faceToDualEdge.get(facePairKey(parentFaceIndex, faceIndex))!]
  })

  return {
    rootFaceIndex,
    parentByFace,
    depthByFace,
    dualEdgeIndices,
    traversalOrder,
    method: 'orange-peel',
    usedFallback: false,
  }
}

function buildMidsphereMinimumSpanningTree(
  polyhedron: DerivedPolyhedron,
  rootFaceIndex: number,
): KeepTree {
  const weightedDualEdges = buildMidsphereWeightedDualEdges(polyhedron, rootFaceIndex)

  if (!weightedDualEdges) {
    const fallbackTree = buildKeepTree(polyhedron, 'bfs', rootFaceIndex)

    return {
      ...fallbackTree,
      method: 'tangency-point-geodesic',
      usedFallback: true,
    }
  }

  const selectedDualEdgeIndices = selectMinimumSpanningDualEdges(polyhedron, weightedDualEdges)
  const adjacency = polyhedron.faces.map(() => [] as number[])

  for (const dualEdgeIndex of selectedDualEdgeIndices) {
    const [faceA, faceB] = polyhedron.dualEdges[dualEdgeIndex].faceIndices
    adjacency[faceA].push(faceB)
    adjacency[faceB].push(faceA)
  }

  const parentByFace: Array<number | null> = polyhedron.faces.map(() => null)
  const depthByFace: Array<number | null> = polyhedron.faces.map(() => null)
  const traversalOrder: number[] = []
  const marked = new Set<number>()
  const queue: SearchEntry[] = [{ parent: null, face: rootFaceIndex, depth: 0 }]

  while (queue.length > 0) {
    const { parent, face, depth } = queue.shift()!

    if (marked.has(face)) {
      continue
    }

    marked.add(face)
    parentByFace[face] = parent
    depthByFace[face] = depth
    traversalOrder.push(face)

    const neighbors = [...adjacency[face]].sort((left, right) => left - right)

    for (const neighbor of neighbors) {
      queue.push({ parent: face, face: neighbor, depth: depth + 1 })
    }
  }

  return {
    rootFaceIndex,
    parentByFace,
    depthByFace,
    dualEdgeIndices: selectedDualEdgeIndices,
    traversalOrder,
    method: 'tangency-point-geodesic',
    usedFallback: false,
  }
}

function buildMidsphereWeightedDualEdges(
  polyhedron: DerivedPolyhedron,
  rootFaceIndex: number,
): WeightedDualEdge[] | null {
  const midsphere = computeMidsphereFit(polyhedron)

  if (!midsphere || midsphere.radius < 1e-8) {
    return null
  }

  const rootPole = computeFacePole(polyhedron, rootFaceIndex, midsphere.center)
  const northPole = new Vector3(0, 0, 1)
  const rotation = new Quaternion().setFromUnitVectors(rootPole, northPole)

  return polyhedron.dualEdges.map((dualEdge) => {
    const tangencyPoint = computeSharedTangencyPoint(polyhedron, dualEdge.primalEdgeIndex)
    const rotatedPoint = tangencyPoint
      .sub(midsphere.center)
      .normalize()
      .applyQuaternion(rotation)

    return {
      dualEdgeIndex: dualEdge.index,
      weight: 1 - clampUnit(rotatedPoint.z),
    }
  })
}

function computeFacePole(
  polyhedron: DerivedPolyhedron,
  faceIndex: number,
  midsphereCenter: Vector3,
) {
  const face = polyhedron.faces[faceIndex]
  const signedDistance = face.normal.dot(face.incenter.clone().sub(midsphereCenter))

  return (signedDistance >= 0 ? face.normal.clone() : face.normal.clone().negate()).normalize()
}

function computeSharedTangencyPoint(polyhedron: DerivedPolyhedron, edgeIndex: number) {
  const edge = polyhedron.edges[edgeIndex]
  const edgeStart = polyhedron.vertices[edge.vertexIndices[0]]
  const edgeEnd = polyhedron.vertices[edge.vertexIndices[1]]
  const [faceAIndex, faceBIndex] = edge.faceIndices
  const tangencyA = projectPointToEdgeLine(polyhedron.faces[faceAIndex].incenter, edgeStart, edgeEnd)
  const tangencyB = projectPointToEdgeLine(polyhedron.faces[faceBIndex].incenter, edgeStart, edgeEnd)

  return tangencyA.add(tangencyB).multiplyScalar(0.5)
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

function selectMinimumSpanningDualEdges(
  polyhedron: DerivedPolyhedron,
  weightedDualEdges: WeightedDualEdge[],
) {
  const disjointSetParent = polyhedron.faces.map((_, faceIndex) => faceIndex)
  const disjointSetRank = polyhedron.faces.map(() => 0)
  const selectedDualEdgeIndices: number[] = []
  const sortedEdges = [...weightedDualEdges].sort((left, right) => {
    if (left.weight !== right.weight) {
      return left.weight - right.weight
    }

    return left.dualEdgeIndex - right.dualEdgeIndex
  })

  const findRoot = (faceIndex: number): number => {
    if (disjointSetParent[faceIndex] !== faceIndex) {
      disjointSetParent[faceIndex] = findRoot(disjointSetParent[faceIndex])
    }

    return disjointSetParent[faceIndex]
  }

  const mergeRoots = (leftFaceIndex: number, rightFaceIndex: number) => {
    const leftRoot = findRoot(leftFaceIndex)
    const rightRoot = findRoot(rightFaceIndex)

    if (leftRoot === rightRoot) {
      return false
    }

    if (disjointSetRank[leftRoot] < disjointSetRank[rightRoot]) {
      disjointSetParent[leftRoot] = rightRoot
    } else if (disjointSetRank[leftRoot] > disjointSetRank[rightRoot]) {
      disjointSetParent[rightRoot] = leftRoot
    } else {
      disjointSetParent[rightRoot] = leftRoot
      disjointSetRank[leftRoot] += 1
    }

    return true
  }

  for (const weightedEdge of sortedEdges) {
    const [faceAIndex, faceBIndex] = polyhedron.dualEdges[weightedEdge.dualEdgeIndex].faceIndices

    if (!mergeRoots(faceAIndex, faceBIndex)) {
      continue
    }

    selectedDualEdgeIndices.push(weightedEdge.dualEdgeIndex)

    if (selectedDualEdgeIndices.length === polyhedron.faces.length - 1) {
      break
    }
  }

  return selectedDualEdgeIndices
}

function buildOrangePeelWalk(
  polyhedron: DerivedPolyhedron,
  rootFaceIndex: number,
  depthByFace: Array<number | null>,
) {
  const neighborRingByFace = buildNeighborRingByFace(polyhedron)
  const visited = polyhedron.faces.map(() => false)
  const traversalOrder: number[] = []
  const parentByFace: Array<number | null> = polyhedron.faces.map(() => null)

  const walk = (face: number, previousFace: number | null) => {
    if (!visited[face]) {
      visited[face] = true
      traversalOrder.push(face)
    }

    const candidates = rankOrangePeelCandidates(
      polyhedron,
      neighborRingByFace,
      depthByFace,
      visited,
      face,
      previousFace,
    )

    for (const candidate of candidates) {
      if (visited[candidate]) {
        continue
      }

      parentByFace[candidate] = face
      walk(candidate, face)
    }
  }

  walk(rootFaceIndex, null)

  return {
    traversalOrder,
    parentByFace,
  }
}

function buildBreadthFirstDepthByFace(
  adjacency: number[][],
  rootFaceIndex: number,
) {
  const depthByFace: Array<number | null> = adjacency.map(() => null)
  const marked = new Set<number>()
  const bag: SearchEntry[] = [{ parent: null, face: rootFaceIndex, depth: 0 }]

  while (bag.length > 0) {
    const { face, depth } = bag.shift()!

    if (marked.has(face)) {
      continue
    }

    marked.add(face)
    depthByFace[face] = depth

    const neighbors = [...adjacency[face]].sort((left, right) => left - right)

    for (const neighbor of neighbors) {
      bag.push({ parent: face, face: neighbor, depth: depth + 1 })
    }
  }

  return depthByFace
}

function buildVertexTouchAdjacency(polyhedron: DerivedPolyhedron) {
  const touchingFacesByFace = polyhedron.faces.map(() => new Set<number>())
  const incidentFacesByVertex = new Map<number, number[]>()

  for (const face of polyhedron.faces) {
    for (const vertexIndex of face.vertexIndices) {
      const incidentFaces = incidentFacesByVertex.get(vertexIndex)

      if (incidentFaces) {
        incidentFaces.push(face.index)
      } else {
        incidentFacesByVertex.set(vertexIndex, [face.index])
      }
    }
  }

  for (const incidentFaces of incidentFacesByVertex.values()) {
    for (const faceIndex of incidentFaces) {
      const touchingFaces = touchingFacesByFace[faceIndex]

      for (const neighborFaceIndex of incidentFaces) {
        if (neighborFaceIndex !== faceIndex) {
          touchingFaces.add(neighborFaceIndex)
        }
      }
    }
  }

  return touchingFacesByFace.map((touchingFaces) => [...touchingFaces])
}

function buildNeighborRingByFace(polyhedron: DerivedPolyhedron) {
  const edgeIndexByKey = new Map<string, number>()

  for (const edge of polyhedron.edges) {
    edgeIndexByKey.set(edgeKey(edge.vertexIndices[0], edge.vertexIndices[1]), edge.index)
  }

  return polyhedron.faces.map((face) => {
    const neighbors: number[] = []

    for (let index = 0; index < face.vertexIndices.length; index += 1) {
      const a = face.vertexIndices[index]
      const b = face.vertexIndices[(index + 1) % face.vertexIndices.length]
      const edgeIndex = edgeIndexByKey.get(edgeKey(a, b))

      if (edgeIndex === undefined) {
        continue
      }

      const edge = polyhedron.edges[edgeIndex]
      const neighbor = edge.faceIndices[0] === face.index
        ? edge.faceIndices[1]
        : edge.faceIndices[0]

      neighbors.push(neighbor)
    }

    return neighbors
  })
}

function rankOrangePeelCandidates(
  polyhedron: DerivedPolyhedron,
  neighborRingByFace: number[][],
  depthByFace: Array<number | null>,
  visited: boolean[],
  currentFace: number,
  previousFace: number | null,
) {
  const orientedNeighbors = orientNeighborRing(neighborRingByFace[currentFace], previousFace)
  const currentDepth = depthByFace[currentFace] ?? Number.POSITIVE_INFINITY

  return orientedNeighbors
    .map((face, cyclicRank) => ({ face, cyclicRank }))
    .filter(({ face }) => !visited[face])
    .sort((left, right) => {
      const leftDepth = depthByFace[left.face] ?? Number.POSITIVE_INFINITY
      const rightDepth = depthByFace[right.face] ?? Number.POSITIVE_INFINITY

      const leftDepthPenalty = Math.abs(leftDepth - currentDepth)
      const rightDepthPenalty = Math.abs(rightDepth - currentDepth)

      if (leftDepthPenalty !== rightDepthPenalty) {
        return leftDepthPenalty - rightDepthPenalty
      }

      const leftSameDepthPriority = leftDepth === currentDepth ? 0 : 1
      const rightSameDepthPriority = rightDepth === currentDepth ? 0 : 1

      if (leftSameDepthPriority !== rightSameDepthPriority) {
        return leftSameDepthPriority - rightSameDepthPriority
      }

      const leftOnwardOptions = countUnvisitedNeighbors(polyhedron, visited, left.face, currentFace)
      const rightOnwardOptions = countUnvisitedNeighbors(polyhedron, visited, right.face, currentFace)

      if (leftOnwardOptions !== rightOnwardOptions) {
        return leftOnwardOptions - rightOnwardOptions
      }

      if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth
      }

      return left.cyclicRank - right.cyclicRank
    })
    .map(({ face }) => face)
}

function orientNeighborRing(neighbors: number[], previousFace: number | null) {
  if (previousFace === null) {
    return [...neighbors]
  }

  const previousIndex = neighbors.indexOf(previousFace)

  if (previousIndex < 0) {
    return [...neighbors]
  }

  const startIndex = (previousIndex + 1) % neighbors.length
  return neighbors.slice(startIndex).concat(neighbors.slice(0, startIndex))
}

function countUnvisitedNeighbors(
  polyhedron: DerivedPolyhedron,
  visited: boolean[],
  face: number,
  blockedFace: number,
) {
  return polyhedron.faceAdjacency[face].filter((neighbor) => neighbor !== blockedFace && !visited[neighbor]).length
}

export function buildCutTree(polyhedron: DerivedPolyhedron, keepTree: KeepTree): CutTree {
  const keptPrimalEdges = new Set(
    keepTree.dualEdgeIndices.map((dualEdgeIndex) => polyhedron.dualEdges[dualEdgeIndex].primalEdgeIndex),
  )

  return {
    primalEdgeIndices: polyhedron.edges
      .filter((edge) => !keptPrimalEdges.has(edge.index))
      .map((edge) => edge.index),
  }
}
