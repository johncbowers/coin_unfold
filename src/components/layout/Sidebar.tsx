import type { CutTree, DerivedPolyhedron, KeepTree, RenderMode, TreeMethod } from '../../types/polyhedron'

type ThemeMode = 'light' | 'dark'

interface SidebarProps {
  polyhedronOptions: Array<{ id: string; name: string }>
  polyhedronId: string
  onPolyhedronChange: (id: string) => void
  method: TreeMethod
  onMethodChange: (method: TreeMethod) => void
  rootFaceIndex: number
  onRootFaceChange: (rootFaceIndex: number) => void
  renderMode: RenderMode
  onRenderModeChange: (mode: RenderMode) => void
  showEdges: boolean
  onShowEdgesChange: (value: boolean) => void
  showKeepTree: boolean
  onShowKeepTreeChange: (value: boolean) => void
  showCutTree: boolean
  onShowCutTreeChange: (value: boolean) => void
  animationSpeed: number
  onAnimationSpeedChange: (value: number) => void
  themeMode: ThemeMode
  onThemeModeChange: (mode: ThemeMode) => void
  polyhedron: DerivedPolyhedron
  keepTree: KeepTree
  cutTree: CutTree
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

export function Sidebar({
  polyhedronOptions,
  polyhedronId,
  onPolyhedronChange,
  method,
  onMethodChange,
  rootFaceIndex,
  onRootFaceChange,
  renderMode,
  onRenderModeChange,
  showEdges,
  onShowEdgesChange,
  showKeepTree,
  onShowKeepTreeChange,
  showCutTree,
  onShowCutTreeChange,
  animationSpeed,
  onAnimationSpeedChange,
  themeMode,
  onThemeModeChange,
  polyhedron,
  keepTree,
  cutTree,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <section className="panel-section">
        <h2>Polyhedron</h2>
        <label className="field">
          <span>Model</span>
          <select value={polyhedronId} onChange={(event) => onPolyhedronChange(event.target.value)}>
            {polyhedronOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Root face</span>
          <select
            value={rootFaceIndex}
            onChange={(event) => onRootFaceChange(Number(event.target.value))}
          >
            {polyhedron.faces.map((face) => (
              <option key={face.id} value={face.index}>
                Face {face.index}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel-section">
        <h2>Tree generation</h2>
        <label className="field">
          <span>Traversal</span>
          <select value={method} onChange={(event) => onMethodChange(event.target.value as TreeMethod)}>
            <option value="bfs">Breadth-first search</option>
            <option value="dfs">Depth-first search</option>
          </select>
        </label>
        <p className="caption">
          The `KeepTree` is built on the dual graph. The complementary primal edges form the `CutTree`.
        </p>
      </section>

      <section className="panel-section">
        <h2>Display</h2>
        <label className="field">
          <span>Render mode</span>
          <select
            value={renderMode}
            onChange={(event) => onRenderModeChange(event.target.value as RenderMode)}
          >
            <option value="faces">Faces only</option>
            <option value="faces+coins">Faces + coins</option>
            <option value="coins-only">Coins only</option>
          </select>
        </label>

        <div className="toggle-group">
          <ToggleRow label="Show edges" checked={showEdges} onChange={onShowEdgesChange} />
          <ToggleRow label="Show keep tree" checked={showKeepTree} onChange={onShowKeepTreeChange} />
          <ToggleRow label="Show cut tree" checked={showCutTree} onChange={onShowCutTreeChange} />
        </div>
      </section>

      <section className="panel-section">
        <h2>Animation</h2>
        <label className="field">
          <span>Response speed</span>
          <input
            type="range"
            min="1"
            max="12"
            step="0.5"
            value={animationSpeed}
            onChange={(event) => onAnimationSpeedChange(Number(event.target.value))}
          />
        </label>
        <p className="caption">
          The slider target is smoothed so rapid input still unfolds at a readable rate.
        </p>
      </section>

      <section className="panel-section">
        <h2>Diagnostics</h2>
        <dl className="stats-grid">
          <div>
            <dt>Faces</dt>
            <dd>{polyhedron.faces.length}</dd>
          </div>
          <div>
            <dt>Edges</dt>
            <dd>{polyhedron.edges.length}</dd>
          </div>
          <div>
            <dt>Keep edges</dt>
            <dd>{keepTree.dualEdgeIndices.length}</dd>
          </div>
          <div>
            <dt>Cut edges</dt>
            <dd>{cutTree.primalEdgeIndices.length}</dd>
          </div>
        </dl>
        <p className="caption">
          Tree validity check: {keepTree.dualEdgeIndices.length === polyhedron.faces.length - 1 ? 'valid spanning tree' : 'invalid'}.
        </p>
      </section>

      <section className="panel-section theme-section">
        <h2>Theme</h2>
        <label className="field">
          <span>Appearance</span>
          <select
            value={themeMode}
            onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>
    </aside>
  )
}
