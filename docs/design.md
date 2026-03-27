# Coin Unfold — Design Document

## 1. Goal

Build a browser-based interactive visualization system for:

1. viewing a polyhedron in 3D,
2. choosing or generating a `Keep Tree` on the dual graph,
3. deriving the complementary `Cut Tree` on the primal graph,
4. animating an unfolding from folded state to planar net,
5. visualizing both standard face-based unfolding and coin-based unfolding,
6. supporting an extensible library of polyhedra and tree-generation methods.

The application should be cleanly modular and suitable for static hosting such as GitHub Pages.

---

## 2. Recommended v1 Stack

Because the app is fully client-side and should stay easy to extend, the recommended stack is:

- **React** for UI composition
- **TypeScript** for geometry/data-model safety
- **Vite** for fast local development and static build output
- **Three.js** for 3D rendering
- **React Three Fiber** for structured scene composition
- **Zustand** or a small reducer-based store for app state
- **d3-force / custom utilities not required initially**

### Why this stack

- Works well for static deployment.
- Gives a clean split between UI controls and rendering logic.
- TypeScript helps avoid errors in graph/geometry code.
- React Three Fiber keeps the scene graph modular.
- Easy to add more algorithms, polyhedra, overlays, and export features later.

If desired, the core geometry/graph logic can be written framework-agnostically so the rendering/UI layer remains replaceable.

---

## 3. Scope

## v1 In Scope

- Platonic solids:
  - tetrahedron
  - cube
  - octahedron
  - dodecahedron
  - icosahedron
- Dual graph construction
- Keep tree generation via:
  - BFS
  - DFS
- Cut tree derivation from keep tree
- Surface overlays for:
  - primal edges
  - cut tree edges
  - keep tree dual edges
- Slider-controlled unfolding parameter $t \in [0,1]$
- Smoothed animation toward target slider value
- Standard net view based on interpolated dihedral opening
- Coin overlay / coin-only mode with **approximate visual coins** in v1
- Extensible polyhedron registry and algorithm registry

## v1 Out of Scope

- Server-side computation
- Arbitrary imported meshes
- Exact Koebe realization pipeline for general polyhedra
- Proof-oriented exact symbolic geometry
- Full persistence/sharing system
- Automatic non-overlap guarantees for all nets

---

## 4. Core Mathematical Model

### 4.1 Polyhedron Representation

Represent a polyhedron as a combinatorial + geometric object.

```ts
interface PolyhedronData {
  id: string;
  name: string;
  vertices: Vec3[];
  faces: FaceData[];
  edges: EdgeData[];
  metadata?: {
    family?: 'platonic' | 'archimedean' | 'koebe' | string;
    hasMidsphere?: boolean;
    hasFaceIncircles?: boolean;
  };
}
```

Where:

- `vertices` are 3D coordinates,
- `faces` are ordered vertex cycles,
- `edges` are canonical undirected edges with adjacency,
- orientation is consistent across the model.

### 4.2 Face and Edge Adjacency

Precompute:

- face barycenters,
- face normals,
- edge-to-face adjacency,
- face-to-face adjacency,
- dihedral angles,
- local 2D coordinates for each face.

### 4.3 Primal and Dual Graphs

- **Primal graph**: vertices are polyhedron vertices, edges are polyhedron edges.
- **Dual graph**: vertices are faces, edges connect adjacent faces.

Each primal edge corresponds to exactly one dual edge for convex polyhedra with manifold adjacency.

### 4.4 Keep Tree / Cut Tree Relationship

Let:

- `E` = set of primal edges,
- `E*` = set of dual edges,
- `K*` = keep tree on dual graph.

Then the cut tree in the primal graph is the set of primal edges corresponding to dual edges **not** in `K*`.

For convex polyhedra, this is the complement under primal-dual edge correspondence.

So the conversion logic is:

- choose keep tree in dual graph,
- mark the matching primal edges as **hinges**,
- all other primal edges are **cuts**.

This should be implemented as a direct edge correspondence table.

---

## 5. Unfolding Model

### 5.1 Root Face

Choose a root face for the keep tree.

- The root face remains fixed.
- Every other face is positioned relative to its parent in the keep tree.

For v1, default root choices can be:

- first face in the polyhedron definition,
- or a user-selectable face.

### 5.2 Full Unfolding State

At full unfolding, every keep-tree hinge angle is opened until the adjacent faces become coplanar.

If the original dihedral angle at hinge $e$ is $\theta_e$, then the required opening amount is:

$$
\Delta_e = \pi - \theta_e
$$

At animation value $t \in [0,1]$:

$$
\theta_e(t) = \theta_e + t(\pi - \theta_e)
$$

Equivalently, the hinge rotation applied relative to the folded state is:

$$
\phi_e(t) = t(\pi - \theta_e)
$$

This is the linear interpolation requested by the spec.

### 5.3 Hierarchical Transform Propagation

The unfolded pose is computed by traversing the keep tree from the root.

For each child face:

1. identify the shared hinge edge with its parent,
2. compute the fold axis along that edge,
3. rotate the child face by the interpolated hinge amount relative to the parent,
4. propagate the resulting rigid transform to all descendants.

This forms a standard articulated tree of rigid panels.

### 5.4 Coplanar Final Net Coordinates

There are two equivalent ways to render the result:

#### Option A — Pure 3D Transform Interpolation

Keep all geometry in 3D and animate through 3D transforms until the final state becomes coplanar.

#### Option B — Precompute Final Net, Then Interpolate

Precompute the fully unfolded face transforms, then interpolate from folded transforms toward those final transforms.

### Recommendation

Use **Option A**.

Reason:

- follows the actual hinge mechanics,
- matches the user’s dihedral interpolation description,
- simplifies debugging,
- makes tree changes easy.

---

## 6. Coin Polyhedron Model

### 6.1 Conceptual Model

For each face with a well-defined incircle:

- compute its incenter,
- compute its inradius,
- render a disk lying in the face plane.

The coin polyhedron forgets the polygonal face fill and retains only these disks.

### 6.2 v1 Approximation Strategy

Since v1 emphasizes approximate visual coins:

- implement exact incircle computation for regular Platonic faces,
- represent each coin as a circular mesh centered at the face incenter,
- animate each coin using the same rigid face transform as its supporting face.

This is sufficient for Platonic solids because faces are regular polygons.

### 6.3 Future Exact Midsphere Support

Reserve extension points for:

- exact midsphere radius,
- edge tangency point validation,
- Koebe polyhedron input data,
- numerical consistency checks between neighboring face coins.

Add metadata hooks such as:

```ts
interface CoinData {
  center3D: Vec3;
  radius: number;
  faceId: string;
  tangencyPoints?: Vec3[];
}
```

---

## 7. UI / UX Design

## 7.1 Layout

### Header

Contains:

- project title,
- mode badge,
- future room for import/export/help.

### Left Sidebar

Sections:

1. **Polyhedron**
   - polyhedron selector
   - root face selector
2. **Tree Generation**
   - mode: BFS / DFS
   - traversal seed face
   - regenerate button
3. **Display**
   - show faces
   - show edges
   - show cut tree
   - show keep tree
   - show coins
   - coin-only mode
4. **Animation**
   - play/pause
   - reset
   - speed
5. **Diagnostics**
   - number of faces/edges
   - tree validity
   - overlap warning placeholder

### Main 3D Panel

Top overlay:

- unfolding slider from 0 to 1
- animated target value indicator

Main canvas:

- orbit/pan/zoom camera
- polyhedron/net visualization
- optional axis/grid toggle

## 7.2 Slider Behavior

The slider sets a **target unfold amount** `targetT`.
The rendered scene uses a separate animated state `currentT`.

Each frame:

$$
currentT \leftarrow currentT + \alpha (targetT - currentT)
$$

or use a damped spring.

Recommendation:

- use critically damped interpolation or exponential smoothing,
- expose animation speed as a UI setting.

This satisfies the requirement that motion remains visually reasonable even if the user drags the slider abruptly.

---

## 8. Rendering Design

## 8.1 Scene Layers

Render the scene in layers/components:

1. **Face meshes**
2. **Edge wireframe**
3. **Cut tree overlay**
4. **Keep tree overlay**
5. **Coin disks**
6. **Selection/highlight layer**

Each layer can be toggled independently.

## 8.2 Keep Tree Overlay Rendering

A dual edge is drawn as two line segments:

- from face barycenter to midpoint of shared edge inside face A,
- from face barycenter to midpoint of shared edge inside face B.

This avoids drawing a line through the interior of the solid.

Implementation:

- compute face barycenter,
- compute shared primal edge midpoint,
- project slightly off the surface along face normal to avoid z-fighting.

## 8.3 Cut Tree Overlay Rendering

Cut tree edges are primal edges.
Draw them directly on the polyhedron edges using a distinct color/material.

## 8.4 Visual Encoding Recommendation

- ordinary edges: muted gray
- keep tree: blue or teal
- cut tree: orange or red
- selected face/tree seed: yellow
- coins: gold / translucent white

Add polygon offset or small normal displacement to all overlay lines.

---

## 9. Software Architecture

Use a layered architecture.

## 9.1 Package / Folder Structure

```text
src/
  app/
    App.tsx
    routes/
    store/
    providers/
  components/
    layout/
    controls/
    panels/
    scene/
  domain/
    polyhedra/
      registry/
      platonic/
      builders/
    graphs/
    trees/
    unfolding/
    coins/
    geometry/
  render/
    materials/
    overlays/
    hooks/
    r3f/
  utils/
  types/
```

## 9.2 Separation of Concerns

### `domain/geometry`

Pure geometry utilities:

- vector math helpers,
- face plane computation,
- incenter/inradius,
- dihedral angles,
- rigid transforms.

### `domain/graphs`

Pure graph builders:

- primal graph,
- dual graph,
- edge correspondence tables.

### `domain/trees`

Algorithms:

- BFS keep tree,
- DFS keep tree,
- tree validation,
- keep-to-cut conversion.

### `domain/unfolding`

Unfold engine:

- root selection,
- transform propagation,
- per-face transform computation for given `t`.

### `domain/coins`

Coin extraction and validation:

- face incenter/radius,
- coin mesh descriptors,
- future midsphere checks.

### `components/controls`

UI widgets only.

### `components/scene`

Scene assembly only.

This keeps math independent from the browser framework.

---

## 10. Data Structures

## 10.1 Face

```ts
interface FaceData {
  id: string;
  vertexIds: number[];
}
```

## 10.2 Edge

```ts
interface EdgeData {
  id: string;
  v0: number;
  v1: number;
  adjacentFaceIds: [string, string];
}
```

## 10.3 Dual Edge

```ts
interface DualEdgeData {
  id: string;
  faceA: string;
  faceB: string;
  primalEdgeId: string;
}
```

## 10.4 Keep Tree

```ts
interface KeepTree {
  rootFaceId: string;
  faceParent: Record<string, string | null>;
  dualEdgeIds: string[];
  traversalOrder: string[];
  method: 'bfs' | 'dfs' | string;
}
```

## 10.5 Cut Tree

```ts
interface CutTree {
  primalEdgeIds: string[];
}
```

## 10.6 Unfold Pose

```ts
interface FacePose {
  faceId: string;
  matrixWorld: Mat4;
  normal: Vec3;
}
```

---

## 11. Algorithms

## 11.1 Dual Graph Construction

For each primal edge with adjacent faces `(fA, fB)`:

- create one dual edge connecting `fA` and `fB`,
- attach reference to the primal edge id.

Complexity: $O(|E|)$.

## 11.2 BFS / DFS Keep Tree

Input:

- dual graph,
- root face.

Output:

- spanning tree over faces.

Pseudo-flow:

1. initialize `visited` with root,
2. traverse adjacency using queue or stack,
3. when first reaching an unvisited face, add that dual edge to tree,
4. continue until all faces visited.

Complexity: $O(|F| + |E^*|)$.

## 11.3 Keep-to-Cut Conversion

Given dual tree edges, compute:

$$
\text{CutEdges} = E \setminus \{ \text{primalEdge}(e^*) : e^* \in K^* \}
$$

Complexity: $O(|E|)$ with a set lookup.

## 11.4 Unfold Transform Computation

For each non-root face in tree order:

1. get parent face pose,
2. find shared edge axis in parent/world coordinates,
3. compute rotation angle $\phi_e(t)$,
4. compose child transform from parent transform and hinge rotation,
5. store pose.

Complexity per update: $O(|F|)$.

This is small enough for per-frame recomputation on Platonic solids.

---

## 12. Extensibility Strategy

## 12.1 Polyhedron Registry

Use a registry pattern:

```ts
interface PolyhedronFactory {
  id: string;
  name: string;
  create(): PolyhedronData;
}
```

Then maintain:

```ts
const polyhedronRegistry: PolyhedronFactory[] = [...];
```

This makes it easy to add:

- Archimedean solids,
- custom Koebe polyhedra,
- imported JSON definitions.

## 12.2 Algorithm Registry

```ts
interface KeepTreeAlgorithm {
  id: string;
  name: string;
  build(input: DualGraph, rootFaceId: string): KeepTree;
}
```

Start with BFS and DFS. Later add:

- shortest-path-like trees,
- random spanning trees,
- optimization-based trees,
- user-authored trees.

## 12.3 Render Mode Registry

Support modes such as:

- `faces`
- `faces+coins`
- `coins-only`
- `net-debug`

This avoids hardcoding scene behavior.

---

## 13. State Management

Recommended top-level app state:

```ts
interface AppState {
  polyhedronId: string;
  rootFaceId: string;
  keepTreeAlgorithmId: string;
  keepTree: KeepTree | null;
  cutTree: CutTree | null;
  targetT: number;
  currentT: number;
  animationSpeed: number;
  renderMode: 'faces' | 'faces+coins' | 'coins-only';
  showEdges: boolean;
  showKeepTree: boolean;
  showCutTree: boolean;
  showCoins: boolean;
}
```

Rules:

- derived state should be memoized, not duplicated,
- keep tree and cut tree should regenerate whenever polyhedron, root, or algorithm changes,
- face poses should derive from `currentT` and current tree.

---

## 14. Numerical / Graphics Considerations

## 14.1 Face Orientation Consistency

All faces must use consistent winding order. Otherwise:

- normals may flip,
- dihedral angle sign logic may break,
- hinge rotation directions may become inconsistent.

Add validation during polyhedron loading.

## 14.2 Z-Fighting

Overlay lines should be slightly offset from faces using:

- normal displacement,
- polygon offset,
- line rendering priorities.

## 14.3 Rotation Direction

The hinge rotation sign must be defined consistently.

Recommended approach:

- compute parent and child face normals,
- use shared edge orientation plus right-hand rule,
- validate against final coplanarity at `t = 1`.

## 14.4 Net Self-Intersection

Some keep trees may produce overlapping nets.

For v1:

- allow overlap,
- optionally show a warning badge later,
- do not block rendering.

---

## 15. Testing Strategy

## 15.1 Unit Tests

For pure domain code:

- dual graph correctness,
- BFS/DFS spanning tree size,
- keep-to-cut complement correctness,
- dihedral interpolation correctness,
- final `t=1` coplanarity of adjacent kept faces,
- incenter / inradius calculations for regular polygons.

## 15.2 Visual Regression Targets

Use a few fixed scenes:

- cube folded,
- cube half-open,
- cube fully unfolded,
- tetrahedron coin mode,
- dodecahedron keep-tree overlay.

## 15.3 Invariant Checks

At runtime in dev mode:

- keep tree contains `|F|-1` edges,
- cut tree contains `|E|-|F|+1` edges for convex polyhedra,
- every face reachable from root,
- every dual tree edge maps to exactly one primal edge.

---

## 16. Suggested Implementation Phases

## Phase 1 — Scaffold

- Vite + React + TypeScript app
- basic layout
- Three.js canvas
- polyhedron registry with tetrahedron and cube

## Phase 2 — Domain Core

- geometry primitives
- primal/dual graph builders
- BFS/DFS keep tree generation
- cut tree derivation

## Phase 3 — Static Visualization

- render faces and edges
- render keep tree and cut tree overlays
- polyhedron selector

## Phase 4 — Unfold Animation

- root face support
- hierarchical hinge transforms
- slider + smoothed target tracking
- play/pause/reset

## Phase 5 — Coin Visualization

- compute face incircles
- render disks on faces
- coin-only mode

## Phase 6 — Hardening

- modular cleanup
- tests
- docs
- GitHub Pages deployment

---

## 17. Recommended v1 Milestone Definition

A successful first milestone should let a user:

1. choose one of the Platonic solids,
2. choose BFS or DFS keep tree generation,
3. see keep tree and cut tree overlays on the polyhedron,
4. drag a slider and watch the model unfold smoothly,
5. toggle between face and coin visualization modes,
6. deploy the result as a static site.

---

## 18. Open Design Choices (Non-Blocking)

These do not block architecture, but should eventually be decided:

1. Whether root face selection should be exposed in the first UI pass.
2. Whether the final fully open view should reorient the camera automatically toward the net plane.
3. Whether future custom tree editing should be click-based in the viewport or form-based in the sidebar.
4. Whether overlap detection should be purely visual or algorithmic.

---

## 19. Recommended Next Build Step

The next step should be to scaffold the app with:

- React + TypeScript + Vite,
- a split layout,
- a polyhedron registry,
- pure domain modules for graphs/trees,
- a cube proof-of-concept unfolding.

That gives the fastest path to validating the architecture and the unfolding engine.
