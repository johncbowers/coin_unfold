import {
  buildFaceBasis,
  computeFaceIncircle,
  buildDualRawPolyhedron,
  clampUnit,
  computeCentroid,
  computeFaceNormal,
  edgeKey,
  facePairKey,
  orientFacesOutward,
  scaleRawPolyhedron,
  toVector3,
} from '../geometry/polyhedronMath'
import {
  archimedeanPolyhedronIds,
  archimedeanRawPolyhedraById,
} from './archimedeanData'
import {
  catalanPolyhedronIds,
  catalanRawPolyhedraById,
} from './catalanData'
import type {
  CoinData,
  DerivedPolyhedron,
  DualEdgeData,
  EdgeData,
  FaceData,
  RawPolyhedron,
} from '../../types/polyhedron'

const PHI = (1 + Math.sqrt(5)) / 2

const tetrahedron: RawPolyhedron = {
  id: 'tetrahedron',
  name: 'Tetrahedron',
  vertices: [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ],
  faces: [
    [0, 2, 1],
    [0, 1, 3],
    [0, 3, 2],
    [1, 2, 3],
  ],
}

const cube: RawPolyhedron = {
  id: 'cube',
  name: 'Cube',
  vertices: [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ],
  faces: [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [4, 0, 3, 7],
  ],
}

const octahedron: RawPolyhedron = {
  id: 'octahedron',
  name: 'Octahedron',
  vertices: [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ],
  faces: [
    [0, 2, 4],
    [2, 1, 4],
    [1, 3, 4],
    [3, 0, 4],
    [2, 0, 5],
    [1, 2, 5],
    [3, 1, 5],
    [0, 3, 5],
  ],
}

const icosahedron: RawPolyhedron = {
  id: 'icosahedron',
  name: 'Icosahedron',
  vertices: [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
  ],
  faces: [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ],
}

const dodecahedron = buildDualRawPolyhedron(icosahedron, 'dodecahedron', 'Dodecahedron')

const archimedeanRawPolyhedra = archimedeanPolyhedronIds.map(
  (id) => archimedeanRawPolyhedraById[id],
)
const catalanRawPolyhedra = catalanPolyhedronIds.map(
  (id) => catalanRawPolyhedraById[id],
)

export type PolyhedronRegistryGroup = 'Platonic Solids' | 'Archimedean Solids' | 'Catalan Polyhedra'

export interface PolyhedronRegistryEntry {
  id: string
  name: string
  group: PolyhedronRegistryGroup
  load: () => Promise<DerivedPolyhedron>
}

function buildDerivedPolyhedron(rawInput: RawPolyhedron): DerivedPolyhedron {
  const raw = scaleRawPolyhedron(orientFacesOutward(rawInput))
  const vertices = raw.vertices.map(toVector3)

  const faces: FaceData[] = raw.faces.map((face, faceIndex) => {
    const points = face.map((vertexIndex) => vertices[vertexIndex])
    const centroid = computeCentroid(points)
    const normal = computeFaceNormal(points)
    const { basisU, basisV } = buildFaceBasis(points, normal)
    const incircle = computeFaceIncircle(points, centroid, basisU, basisV)

    return {
      index: faceIndex,
      id: `${raw.id}-face-${faceIndex}`,
      vertexIndices: face,
      centroid,
      normal,
      basisU,
      basisV,
      incenter: incircle.center3D ?? centroid.clone(),
      inradius: incircle.radius ?? 0,
    }
  })

  const edgeLookup = new Map<
    string,
    { vertexIndices: [number, number]; faceIndices: number[] }
  >()

  faces.forEach((face) => {
    const count = face.vertexIndices.length

    for (let index = 0; index < count; index += 1) {
      const a = face.vertexIndices[index]
      const b = face.vertexIndices[(index + 1) % count]
      const key = edgeKey(a, b)
      const existing = edgeLookup.get(key)

      if (existing) {
        existing.faceIndices.push(face.index)
      } else {
        edgeLookup.set(key, {
          vertexIndices: a < b ? [a, b] : [b, a],
          faceIndices: [face.index],
        })
      }
    }
  })

  const edges: EdgeData[] = Array.from(edgeLookup.values()).map((edge, edgeIndex) => {
    const [v0, v1] = edge.vertexIndices
    const midpoint = vertices[v0].clone().add(vertices[v1]).multiplyScalar(0.5)

    return {
      index: edgeIndex,
      id: `${raw.id}-edge-${edgeIndex}`,
      vertexIndices: edge.vertexIndices,
      faceIndices: [edge.faceIndices[0], edge.faceIndices[1]] as [number, number],
      midpoint,
    }
  })

  const dualEdges: DualEdgeData[] = edges.map((edge, dualEdgeIndex) => {
    const [faceA, faceB] = edge.faceIndices
    const normalA = faces[faceA].normal
    const normalB = faces[faceB].normal
    const normalAngle = Math.acos(clampUnit(normalA.dot(normalB)))
    const dihedral = Math.PI - normalAngle

    return {
      index: dualEdgeIndex,
      id: `${raw.id}-dual-${dualEdgeIndex}`,
      faceIndices: [faceA, faceB],
      primalEdgeIndex: edge.index,
      dihedral,
      openAngle: Math.PI - dihedral,
    }
  })

  const faceAdjacency = faces.map(() => [] as number[])
  const faceToDualEdge = new Map<string, number>()

  dualEdges.forEach((dualEdge) => {
    const [faceA, faceB] = dualEdge.faceIndices
    faceAdjacency[faceA].push(faceB)
    faceAdjacency[faceB].push(faceA)
    faceToDualEdge.set(facePairKey(faceA, faceB), dualEdge.index)
  })

  const radius = Math.max(...vertices.map((vertex) => vertex.length()))

  return {
    id: raw.id,
    name: raw.name,
    vertices,
    faces,
    edges,
    dualEdges,
    faceAdjacency,
    faceToDualEdge,
    radius,
  }
}

function createStaticRegistryEntry(
  raw: RawPolyhedron,
  group: PolyhedronRegistryGroup,
): PolyhedronRegistryEntry {
  let cachedPromise: Promise<DerivedPolyhedron> | null = null

  return {
    id: raw.id,
    name: raw.name,
    group,
    load: () => {
      cachedPromise ??= Promise.resolve(buildDerivedPolyhedron(raw))
      return cachedPromise
    },
  }
}

export const polyhedronRegistry: PolyhedronRegistryEntry[] = [
  tetrahedron,
  cube,
  octahedron,
  dodecahedron,
  icosahedron,
].map((raw) => createStaticRegistryEntry(raw, 'Platonic Solids'))
  .concat(archimedeanRawPolyhedra.map((raw) => createStaticRegistryEntry(raw, 'Archimedean Solids')))
  .concat(catalanRawPolyhedra.map((raw) => createStaticRegistryEntry(raw, 'Catalan Polyhedra')))

export function getPolyhedronById(polyhedronId: string) {
  const entry = polyhedronRegistry.find((candidate) => candidate.id === polyhedronId)
  return entry ?? polyhedronRegistry[0]
}

export function buildCoins(polyhedron: DerivedPolyhedron): CoinData[] {
  return polyhedron.faces.map((face) => ({
    faceIndex: face.index,
    center: face.incenter.clone(),
    radius: face.inradius,
  }))
}
