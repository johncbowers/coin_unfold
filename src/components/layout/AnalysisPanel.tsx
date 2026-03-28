import { memo } from 'react'
import type { InversiveDistanceAnalysis } from '../../domain/analysis/inversiveDistanceAnalysis'
import type { KoebeAnalysis } from '../../domain/analysis/koebeAnalysis'

interface AnalysisPanelProps {
  koebeAnalysis: KoebeAnalysis
  inversiveDistanceAnalysis: InversiveDistanceAnalysis
}

function formatMetric(value: number) {
  if (!Number.isFinite(value)) {
    return '—'
  }

  return value === 0 ? '0' : value.toExponential(2)
}

function summarizeIndices(indices: number[], label: string) {
  if (indices.length === 0) {
    return `No failing ${label}.`
  }

  const preview = indices.slice(0, 8).join(', ')
  return indices.length > 8
    ? `${preview}, +${indices.length - 8} more`
    : preview
}

export const AnalysisPanel = memo(function AnalysisPanel({
  koebeAnalysis,
  inversiveDistanceAnalysis,
}: AnalysisPanelProps) {
  const inversiveStatusLabel = !inversiveDistanceAnalysis.isAvailable
    ? 'Midsphere fit unavailable'
    : inversiveDistanceAnalysis.isInversiveExpansive
      ? 'No non-tree pair contracts'
      : 'Some non-tree pairs contract'

  return (
    <section className="analysis-panel">
      <div className="analysis-panel-header">
        <div>
          <h2>Koebe analysis</h2>
          <p className="caption">
            A valid `Koebe` polyhedron has a tangential incircle on every face, and adjacent face incircles touch at the same point on their shared edge.
          </p>
        </div>
        <span className={`analysis-status ${koebeAnalysis.isKoebe ? 'valid' : 'invalid'}`}>
          {koebeAnalysis.isKoebe ? 'Valid Koebe polyhedron' : 'Not a Koebe polyhedron'}
        </span>
      </div>

      <dl className="analysis-grid">
        <div>
          <dt>Valid faces</dt>
          <dd>
            {koebeAnalysis.validFaceCount} / {koebeAnalysis.faceAnalyses.length}
          </dd>
        </div>
        <div>
          <dt>Valid shared-edge touches</dt>
          <dd>
            {koebeAnalysis.validEdgeCount} / {koebeAnalysis.edgeAnalyses.length}
          </dd>
        </div>
        <div>
          <dt>Max face residual</dt>
          <dd>{formatMetric(koebeAnalysis.maxFaceResidual)}</dd>
        </div>
        <div>
          <dt>Max edge mismatch</dt>
          <dd>{formatMetric(koebeAnalysis.maxEdgeSeparation)}</dd>
        </div>
      </dl>

      <div className="analysis-details">
        <div className="analysis-detail-card">
          <h3>Faces without a valid incircle</h3>
          <p>{summarizeIndices(koebeAnalysis.invalidFaceIndices, 'faces')}</p>
        </div>
        <div className="analysis-detail-card">
          <h3>Edges without a common touch point</h3>
          <p>{summarizeIndices(koebeAnalysis.invalidEdgeIndices, 'edges')}</p>
        </div>
      </div>

      <div className="analysis-panel-header analysis-subsection-header">
        <div>
          <h2>Inversive distance analysis</h2>
          <p className="caption">
            For each unordered coin pair not joined by a `KeepTree` edge, compare inversive distance on the midsphere with inversive distance in the unfolded plane.
          </p>
        </div>
        <span className={`analysis-status ${inversiveDistanceAnalysis.isAvailable && inversiveDistanceAnalysis.isInversiveExpansive ? 'valid' : 'invalid'}`}>
          {inversiveStatusLabel}
        </span>
      </div>

      <dl className="analysis-grid">
        <div>
          <dt>Pairs checked</dt>
          <dd>{inversiveDistanceAnalysis.pairCount}</dd>
        </div>
        <div>
          <dt>Increasing pairs</dt>
          <dd>{inversiveDistanceAnalysis.increasedPairCount}</dd>
        </div>
        <div>
          <dt>Contracting pairs</dt>
          <dd>{inversiveDistanceAnalysis.decreasedPairCount}</dd>
        </div>
        <div>
          <dt>Overlap pairs</dt>
          <dd>{inversiveDistanceAnalysis.overlapPairCount}</dd>
        </div>
        <div>
          <dt>Max contraction</dt>
          <dd>{formatMetric(inversiveDistanceAnalysis.maxDecrease)}</dd>
        </div>
        <div>
          <dt>Min Δ(plane − sphere)</dt>
          <dd>{formatMetric(inversiveDistanceAnalysis.minDelta)}</dd>
        </div>
        <div>
          <dt>Min planar inversive distance</dt>
          <dd>{formatMetric(inversiveDistanceAnalysis.minPlanarInversiveDistance)}</dd>
        </div>
        <div>
          <dt>Midsphere fit residual</dt>
          <dd>{formatMetric(inversiveDistanceAnalysis.midsphereFitResidual)}</dd>
        </div>
      </dl>

      <div className="analysis-details">
        <div className="analysis-detail-card">
          <h3>Overlapping coins in the net</h3>
          <p>{summarizePairs(inversiveDistanceAnalysis.overlapFacePairs)}</p>
        </div>
        <div className="analysis-detail-card">
          <h3>Coins highlighted in 2D view</h3>
          <p>{summarizeOverlapFaces(inversiveDistanceAnalysis.overlapFaceIndices)}</p>
        </div>
      </div>
    </section>
  )
})

function summarizePairs(pairs: Array<[number, number]>) {
  if (pairs.length === 0) {
    return 'No overlapping non-tree coin pairs.'
  }

  const preview = pairs.slice(0, 6).map(([left, right]) => `${left}-${right}`).join(', ')
  return pairs.length > 6
    ? `${preview}, +${pairs.length - 6} more`
    : preview
}

function summarizeOverlapFaces(indices: number[]) {
  if (indices.length === 0) {
    return 'No highlighted coins.'
  }

  const preview = indices.slice(0, 8).join(', ')
  return indices.length > 8
    ? `${preview}, +${indices.length - 8} more`
    : preview
}
