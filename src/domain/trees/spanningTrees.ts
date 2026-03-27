import { facePairKey } from '../geometry/polyhedronMath'
import type { CutTree, DerivedPolyhedron, KeepTree, TreeMethod } from '../../types/polyhedron'

interface SearchEntry {
  parent: number | null
  face: number
}

export function buildKeepTree(
  polyhedron: DerivedPolyhedron,
  method: TreeMethod,
  rootFaceIndex: number,
): KeepTree {
  const parentByFace: Array<number | null> = polyhedron.faces.map(() => null)
  const traversalOrder: number[] = []
  const dualEdgeIndices: number[] = []
  buildWhateverFirstTree(
    polyhedron,
    method,
    rootFaceIndex,
    parentByFace,
    traversalOrder,
    dualEdgeIndices,
  )

  return {
    rootFaceIndex,
    parentByFace,
    dualEdgeIndices,
    traversalOrder,
    method,
  }
}

function buildWhateverFirstTree(
  polyhedron: DerivedPolyhedron,
  method: TreeMethod,
  rootFaceIndex: number,
  parentByFace: Array<number | null>,
  traversalOrder: number[],
  dualEdgeIndices: number[],
) {
  const marked = new Set<number>()
  const bag: SearchEntry[] = [{ parent: null, face: rootFaceIndex }]

  while (bag.length > 0) {
    const entry = method === 'bfs' ? bag.shift()! : bag.pop()!
    const { parent, face } = entry

    if (marked.has(face)) {
      continue
    }

    marked.add(face)
    traversalOrder.push(face)

    if (parent !== null) {
      parentByFace[face] = parent
      dualEdgeIndices.push(polyhedron.faceToDualEdge.get(facePairKey(parent, face))!)
    }

    const neighbors = [...polyhedron.faceAdjacency[face]].sort((left, right) => left - right)

    for (const neighbor of neighbors) {
      bag.push({ parent: face, face: neighbor })
    }
  }
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
