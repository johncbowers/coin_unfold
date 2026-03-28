import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'
import './App.css'
import { AnalysisPanel } from './components/layout/AnalysisPanel'
import { Sidebar } from './components/layout/Sidebar'
import { analyzeKoebePolyhedron } from './domain/analysis/koebeAnalysis'
import { buildCoins, getPolyhedronById, polyhedronRegistry } from './domain/polyhedra/registry'
import { buildCutTree, buildKeepTree } from './domain/trees/spanningTrees'
import { computeFacePoses, prepareFacePoseRig } from './domain/unfolding/computeUnfoldedState'
import type { DerivedPolyhedron, RenderMode, TreeMethod } from './types/polyhedron'

const PolyhedronScene = lazy(async () => {
  const module = await import('./components/scene/PolyhedronScene')
  return { default: module.PolyhedronScene }
})

const NetView2D = lazy(async () => {
  const module = await import('./components/scene/NetView2D')
  return { default: module.NetView2D }
})

type ThemeMode = 'light' | 'dark'

interface UrlSelectionState {
  polyhedronId: string
  method: TreeMethod
  rootFaceIndex: number
}

const DEFAULT_URL_SELECTION: UrlSelectionState = {
  polyhedronId: polyhedronRegistry[0].id,
  method: 'bfs',
  rootFaceIndex: 0,
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const stored = window.localStorage.getItem('coin-unfold-theme')
  return stored === 'dark' ? 'dark' : 'light'
}

function downloadUrl(url: string, fileName: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
}

function getInitialUrlSelection(): UrlSelectionState {
  if (typeof window === 'undefined') {
    return DEFAULT_URL_SELECTION
  }

  const params = new URLSearchParams(window.location.search)
  const requestedPolyhedronId = params.get('poly')
  const requestedMethod = params.get('tree')
  const requestedFace = Number.parseInt(params.get('face') ?? '0', 10)
  const validPolyhedronId = polyhedronRegistry.some((entry) => entry.id === requestedPolyhedronId)
    ? requestedPolyhedronId!
    : DEFAULT_URL_SELECTION.polyhedronId
  const validMethod: TreeMethod = requestedMethod === 'bfs'
    || requestedMethod === 'dfs'
    || requestedMethod === 'orange-peel'
    ? requestedMethod
    : DEFAULT_URL_SELECTION.method

  return {
    polyhedronId: validPolyhedronId,
    method: validMethod,
    rootFaceIndex: Number.isFinite(requestedFace) && requestedFace >= 0 ? requestedFace : 0,
  }
}

function App() {
  const initialUrlSelection = getInitialUrlSelection()
  const [polyhedronId, setPolyhedronId] = useState(initialUrlSelection.polyhedronId)
  const [method, setMethod] = useState<TreeMethod>(initialUrlSelection.method)
  const [rootFaceIndex, setRootFaceIndex] = useState(initialUrlSelection.rootFaceIndex)
  const [renderMode, setRenderMode] = useState<RenderMode>('faces+coins')
  const [showEdges, setShowEdges] = useState(true)
  const [showKeepTree, setShowKeepTree] = useState(true)
  const [showCutTree, setShowCutTree] = useState(true)
  const [targetT, setTargetT] = useState(0)
  const [currentT, setCurrentT] = useState(0)
  const [animationSpeed, setAnimationSpeed] = useState(5)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [fitViewNonce, setFitViewNonce] = useState(0)
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme)
  const frameRef = useRef<number | null>(null)
  const lastTimestampRef = useRef<number | null>(null)
  const canvasShellRef = useRef<HTMLDivElement | null>(null)
  const [polyhedron, setPolyhedron] = useState<DerivedPolyhedron | null>(null)
  const [polyhedronLoadError, setPolyhedronLoadError] = useState<string | null>(null)

  const polyhedronEntry = useMemo(() => getPolyhedronById(polyhedronId), [polyhedronId])
  const polyhedronOptions = useMemo(
    () => polyhedronRegistry.map(({ id, name }) => ({ id, name })),
    [],
  )
  const exportStem = useMemo(
    () => `${polyhedronId}-${method}-${renderMode}`,
    [method, polyhedronId, renderMode],
  )

  const activeRootFaceIndex = polyhedron
    ? Math.min(rootFaceIndex, polyhedron.faces.length - 1)
    : rootFaceIndex

  const keepTree = useMemo(
    () => (polyhedron ? buildKeepTree(polyhedron, method, activeRootFaceIndex) : null),
    [activeRootFaceIndex, method, polyhedron],
  )
  const cutTree = useMemo(
    () => (polyhedron && keepTree ? buildCutTree(polyhedron, keepTree) : null),
    [keepTree, polyhedron],
  )
  const coins = useMemo(() => (polyhedron ? buildCoins(polyhedron) : null), [polyhedron])
  const facePoseRig = useMemo(
    () => (polyhedron && keepTree ? prepareFacePoseRig(polyhedron, keepTree) : null),
    [keepTree, polyhedron],
  )
  const facePoses = useMemo(
    () => (facePoseRig ? computeFacePoses(facePoseRig, currentT) : null),
    [currentT, facePoseRig],
  )
  const netFacePoses = useMemo(
    () => (facePoseRig ? computeFacePoses(facePoseRig, 1) : null),
    [facePoseRig],
  )
  const sceneView = useMemo(() => {
    if (!polyhedron || !facePoses) {
      return {
        target: new Vector3(0, 0, 0),
        distance: 8,
      }
    }

    const allPoints = polyhedron.faces.flatMap((face, faceIndex) =>
      face.vertexIndices.map((vertexIndex) =>
        polyhedron.vertices[vertexIndex].clone().applyMatrix4(facePoses[faceIndex]),
      ),
    )

    const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
    const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)

    for (const point of allPoints) {
      min.min(point)
      max.max(point)
    }

    const target = min.clone().add(max).multiplyScalar(0.5)
    const radius = Math.max(
      1,
      ...allPoints.map((point) => point.distanceTo(target)),
    )

    return {
      target,
      distance: radius * 3.1,
    }
  }, [facePoses, polyhedron])
  const koebeAnalysis = useMemo(
    () => (polyhedron ? analyzeKoebePolyhedron(polyhedron) : null),
    [polyhedron],
  )

  useEffect(() => {
    let cancelled = false

    setPolyhedron(null)
    setPolyhedronLoadError(null)

    polyhedronEntry.load()
      .then((nextPolyhedron) => {
        if (cancelled) {
          return
        }

        setPolyhedron(nextPolyhedron)
        setRootFaceIndex((value) => Math.min(value, nextPolyhedron.faces.length - 1))
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Unknown loading failure'
        setPolyhedronLoadError(message)
      })

    return () => {
      cancelled = true
    }
  }, [polyhedronEntry])

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
    window.localStorage.setItem('coin-unfold-theme', themeMode)
  }, [themeMode])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('poly', polyhedronId)
    url.searchParams.set('face', String(activeRootFaceIndex))
    url.searchParams.set('tree', method)
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }, [activeRootFaceIndex, method, polyhedronId])

  useEffect(() => {
    const animate = (timestamp: number) => {
      const lastTimestamp = lastTimestampRef.current ?? timestamp
      const deltaSeconds = Math.min(0.05, (timestamp - lastTimestamp) / 1000)
      lastTimestampRef.current = timestamp

      setCurrentT((value) => {
        const smoothing = 1 - Math.exp(-animationSpeed * deltaSeconds)
        const nextValue = value + (targetT - value) * smoothing
        return Math.abs(nextValue - targetT) < 0.0005 ? targetT : nextValue
      })

      frameRef.current = window.requestAnimationFrame(animate)
    }

    frameRef.current = window.requestAnimationFrame(animate)

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
      lastTimestampRef.current = null
    }
  }, [animationSpeed, targetT])

  const downloadCurrentViewPng = () => {
    const canvas = canvasShellRef.current?.querySelector('canvas')

    if (!canvas) {
      return
    }

    const url = canvas.toDataURL('image/png')
    downloadUrl(url, `${exportStem}-3d.png`)
  }

  const handlePolyhedronChange = useCallback((nextId: string) => {
    setPolyhedronId(nextId)
    setRootFaceIndex(0)
    setTargetT(0)
    setCurrentT(0)
    setFitViewNonce((value) => value + 1)
  }, [])

  const isReady = polyhedron !== null && keepTree !== null && cutTree !== null && coins !== null
    && facePoses !== null && netFacePoses !== null && koebeAnalysis !== null

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Coin Unfold</p>
          <h1>Polyhedron unfolding explorer</h1>
        </div>
        <button
          type="button"
          className="mobile-controls-button"
          onClick={() => setIsSidebarOpen((value) => !value)}
          aria-expanded={isSidebarOpen}
          aria-controls="app-sidebar"
        >
          {isSidebarOpen ? 'Hide controls' : 'Show controls'}
        </button>
      </header>

      <main className="workspace-grid">
        <div
          className={`sidebar-shell${isSidebarOpen ? ' open' : ''}`}
          id="app-sidebar"
        >
          <button
            type="button"
            className="sidebar-close-button"
            onClick={() => setIsSidebarOpen(false)}
          >
            Close
          </button>
          {isReady
            ? (
                <Sidebar
                  polyhedronOptions={polyhedronOptions}
                  polyhedronId={polyhedronId}
                  onPolyhedronChange={handlePolyhedronChange}
                  method={method}
                  onMethodChange={setMethod}
                  rootFaceIndex={activeRootFaceIndex}
                  onRootFaceChange={setRootFaceIndex}
                  renderMode={renderMode}
                  onRenderModeChange={setRenderMode}
                  showEdges={showEdges}
                  onShowEdgesChange={setShowEdges}
                  showKeepTree={showKeepTree}
                  onShowKeepTreeChange={setShowKeepTree}
                  showCutTree={showCutTree}
                  onShowCutTreeChange={setShowCutTree}
                  animationSpeed={animationSpeed}
                  onAnimationSpeedChange={setAnimationSpeed}
                  themeMode={themeMode}
                  onThemeModeChange={setThemeMode}
                  polyhedron={polyhedron!}
                  keepTree={keepTree!}
                  cutTree={cutTree!}
                />
              )
            : (
                <aside className="sidebar loading-sidebar">
                  <section className="panel-section loading-panel">
                    <h2>{polyhedronLoadError ? 'Load failed' : 'Loading polyhedron'}</h2>
                    <p className="caption">
                      {polyhedronLoadError
                        ? `Could not load ${polyhedronEntry.name}: ${polyhedronLoadError}`
                        : `Preparing ${polyhedronEntry.name}...`}
                    </p>
                  </section>
                </aside>
              )}
        </div>
        <button
          type="button"
          className={`sidebar-scrim${isSidebarOpen ? ' open' : ''}`}
          aria-label="Close controls"
          onClick={() => setIsSidebarOpen(false)}
        />

        <section className="viewer-panel">
          <div className="viewer-toolbar">
            <div className="slider-block">
              <label htmlFor="unfold-slider">Unfold amount</label>
              <input
                id="unfold-slider"
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={targetT}
                onChange={(event) => {
                  setTargetT(Number(event.target.value))
                }}
              />
              <div className="slider-labels">
                <span>Folded</span>
                <span>{Math.round(currentT * 100)}%</span>
                <span>Net</span>
              </div>
            </div>

            <div className="toolbar-buttons">
              <button
                type="button"
                onClick={() => {
                  setTargetT(0)
                }}
              >
                Fold
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetT(1)
                }}
              >
                Unfold
              </button>
            </div>
          </div>

          {isReady
            ? (
                <>
                  <div className="viewer-meta">
                    <span>{polyhedron!.name}</span>
                    <span>Root face {activeRootFaceIndex}</span>
                    <span>{method.toUpperCase()} keep tree</span>
                  </div>

                  <div className="canvas-shell" ref={canvasShellRef}>
                    <div className="view-overlay-controls">
                      <button
                        type="button"
                        className="view-overlay-button"
                        onClick={() => {
                          setFitViewNonce((value) => value + 1)
                        }}
                      >
                        Fit view
                      </button>
                      <button
                        type="button"
                        className="view-overlay-button secondary-overlay-button"
                        onClick={downloadCurrentViewPng}
                      >
                        Download PNG
                      </button>
                    </div>
                    <Suspense fallback={<div className="loading-panel viewer-loading-panel"><h2>Loading 3D viewer</h2><p className="caption">Streaming interactive scene assets...</p></div>}>
                      <PolyhedronScene
                        key={`scene-${fitViewNonce}`}
                        polyhedron={polyhedron!}
                        keepTree={keepTree!}
                        cutTree={cutTree!}
                        facePoses={facePoses!}
                        coins={coins!}
                        cameraTarget={sceneView.target}
                        cameraDistance={sceneView.distance}
                        themeMode={themeMode}
                        renderMode={renderMode}
                        showEdges={showEdges}
                        showKeepTree={showKeepTree}
                        showCutTree={showCutTree}
                      />
                    </Suspense>
                  </div>

                  <Suspense fallback={<div className="loading-panel viewer-loading-panel"><h2>Loading 2D net view</h2><p className="caption">Preparing projected net renderer...</p></div>}>
                    <NetView2D
                      polyhedron={polyhedron!}
                      keepTree={keepTree!}
                      cutTree={cutTree!}
                      facePoses={netFacePoses!}
                      coins={coins!}
                      themeMode={themeMode}
                      exportFileName={`${exportStem}-2d-net.svg`}
                      renderMode={renderMode}
                      showEdges={showEdges}
                      showKeepTree={showKeepTree}
                      showCutTree={showCutTree}
                    />
                  </Suspense>

                  <AnalysisPanel koebeAnalysis={koebeAnalysis!} />
                </>
              )
            : (
                <div className="loading-panel viewer-loading-panel">
                  <h2>{polyhedronLoadError ? 'Load failed' : 'Loading polyhedron viewer'}</h2>
                  <p className="caption">
                    {polyhedronLoadError
                      ? `Could not load ${polyhedronEntry.name}: ${polyhedronLoadError}`
                      : `Preparing geometry for ${polyhedronEntry.name}...`}
                  </p>
                </div>
              )}
        </section>
      </main>

      <footer className="app-footer">
        <p>© 2026 John C. Bowers · built with GitHub Copilot and GPT-5.4</p>
      </footer>
    </div>
  )
}

export default App
