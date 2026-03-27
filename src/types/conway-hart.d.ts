declare module 'conway-hart' {
  interface ConwayHartSolid {
    name: string
    cells: number[][]
    positions: Array<[number, number, number]>
  }

  export default function conwayHart(notation: string): ConwayHartSolid
}
