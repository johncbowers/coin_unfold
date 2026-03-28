import type { Matrix4, Vector3 } from 'three'

export type TreeMethod = 'bfs' | 'dfs' | 'orange-peel'
export type RenderMode = 'faces' | 'faces+coins' | 'coins-only'

export interface RawPolyhedron {
  id: string
  name: string
  vertices: Array<[number, number, number]>
  faces: number[][]
}

export interface PolyhedronOption {
  id: string
  name: string
}

export interface PolyhedronOptionGroup {
  label: string
  options: PolyhedronOption[]
}

export interface FaceData {
  index: number
  id: string
  vertexIndices: number[]
  centroid: Vector3
  normal: Vector3
  basisU: Vector3
  basisV: Vector3
  incenter: Vector3
  inradius: number
}

export interface EdgeData {
  index: number
  id: string
  vertexIndices: [number, number]
  faceIndices: [number, number]
  midpoint: Vector3
}

export interface DualEdgeData {
  index: number
  id: string
  faceIndices: [number, number]
  primalEdgeIndex: number
  dihedral: number
  openAngle: number
}

export interface DerivedPolyhedron {
  id: string
  name: string
  vertices: Vector3[]
  faces: FaceData[]
  edges: EdgeData[]
  dualEdges: DualEdgeData[]
  faceAdjacency: number[][]
  faceToDualEdge: Map<string, number>
  radius: number
}

export interface KeepTree {
  rootFaceIndex: number
  parentByFace: Array<number | null>
  depthByFace: Array<number | null>
  dualEdgeIndices: number[]
  traversalOrder: number[]
  method: TreeMethod
  usedFallback?: boolean
}

export interface CutTree {
  primalEdgeIndices: number[]
}

export interface CoinData {
  faceIndex: number
  center: Vector3
  radius: number
}

export interface SceneComputation {
  keepTree: KeepTree
  cutTree: CutTree
  facePoses: Matrix4[]
  coins: CoinData[]
}
