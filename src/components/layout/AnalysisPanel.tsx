import { memo } from 'react'
import type { KoebeAnalysis } from '../../domain/analysis/koebeAnalysis'

interface AnalysisPanelProps {
  koebeAnalysis: KoebeAnalysis
}

function formatMetric(value: number) {
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

export const AnalysisPanel = memo(function AnalysisPanel({ koebeAnalysis }: AnalysisPanelProps) {
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
    </section>
  )
})
