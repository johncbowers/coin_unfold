import { edgeKey, facePairKey } from '../geometry/polyhedronMath'
import type { CutTree, DerivedPolyhedron, KeepTree, TreeMethod } from '../../types/polyhedron'

interface SearchEntry {
  parent: number | null
  face: number
  depth: number
}

export function buildKeepTree(
  polyhedron: DerivedPolyhedron,
  method: TreeMethod,
  rootFaceIndex: number,
): KeepTree {
  if (method === 'orange-peel') {
    return buildOrangePeelTree(polyhedron, rootFaceIndex)
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
