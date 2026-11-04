import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { api } from '../api'
import EChart from '../components/EChart'
import { Reveal } from '../components/fx'
import { confusionHeatmap } from '../components/chartOptions'
import { EmptyState, ErrorNote, Loading, PageHeader, Panel, Stat, Warnings } from '../components/ui'
import { useJob } from '../JobContext'
import { fmt, pct } from '../risk'

// Below this many flows a per-class score moves a lot on a handful of rows
const SMALL_CLASS = 100

const percent = (v) => `${(v * 100).toFixed(1)}%`

export default function Evaluation() {
  const { jobId, job } = useJob()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const hasEvaluation = Boolean(job?.has_evaluation)

  useEffect(() => {
    if (!hasEvaluation) return
    api.evaluation(jobId).then(setData).catch((e) => setError(e.message))
  }, [jobId, hasEvaluation])

  const heatmap = useMemo(() => data?.multiclass && confusionHeatmap(data.multiclass.confusion), [data])

  if (!hasEvaluation) return <Navigate to="/overview" replace />
  if (error) return <div className="mx-auto max-w-[1560px] px-6 py-12"><ErrorNote>{error}</ErrorNote></div>
  if (!data) return <Loading />

  if (!data.multiclass) {
    return (
      <section className="mx-auto max-w-[1560px] px-6 py-10">
        <PageHeader eyebrow={`Model evaluation · ${data.filename}`} title="Model Evaluation" />
        <Warnings items={job.warnings} />
        <EmptyState title="Nothing to score">None of the labels in this file match a class the models know.</EmptyState>
      </section>
    )
  }

  const s = data.stage1
  const m = data.multiclass
  const matrix = m.confusion

  return (
    <Reveal as="section" className="mx-auto max-w-[1560px] px-6 py-10">
      <PageHeader eyebrow={`Model evaluation · ${data.filename}`} title="Model Evaluation" />
      <p className="-mt-3 mb-4 max-w-3xl text-sm text-muted">
        This file has a Label column. The models never saw it: it was set aside before prediction and is only used to
        score the results on this page, across {fmt(data.rows)} flows.
      </p>
      <Warnings items={job.warnings} />

      <h2 className="mb-4 font-display text-5xl leading-none font-bold uppercase">Attack vs benign <span className="text-muted">/ Stage 1</span></h2>
      <div data-stagger className="cells grid-cols-2 md:grid-cols-5">
        <Metric label="Accuracy" value={s.accuracy} />
        <Metric label="Precision" value={s.precision} />
        <Metric label="Recall" value={s.recall} />
        <Metric label="F1" value={s.f1} />
        <Metric label="False positive rate" value={s.fpr} />
      </div>
      <p className="num mt-3 text-xs text-muted">
        FNR {pct(s.fnr)} · ROC-AUC {s.roc_auc == null ? 'n/a' : s.roc_auc.toFixed(3)} · {fmt(s.tp)} attacks caught,{' '}
        {fmt(s.fn)} missed, {fmt(s.fp)} false alarms · after Stage 2: recall {pct(data.pipeline.recall)}, FPR{' '}
        {pct(data.pipeline.fpr)}
      </p>
      <p className="mt-1 text-xs text-muted">
        Accuracy and precision depend on this file's mix of attacks and benign traffic. Recall and false positive rate
        don't, so compare those between files.
      </p>

      <h2 className="mt-12 mb-4 font-display text-5xl leading-none font-bold uppercase">Which attack <span className="text-muted">/ Full pipeline</span></h2>
      <div data-stagger className="cells grid-cols-2">
        <Metric label="Accuracy" value={m.accuracy} />
        <Metric label="Macro-F1" value={m.macro_f1} />
      </div>

      <Panel
        title="Confusion matrix"
        note="Rows are the labels in the file, columns are what the models predicted. Colour shows the share of each row, numbers are flows."
        className="mt-6"
      >
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <EChart
              option={heatmap}
              height={matrix.true.length * 38 + 130}
              label="Heatmap of true classes against predicted classes"
            />
          </div>
        </div>
      </Panel>

      <Panel title="Per class" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs tracking-wider text-muted uppercase">
                <th scope="col" className="py-2 pr-4 font-medium">Class</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Flows</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Precision</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Recall</th>
                <th scope="col" className="py-2 text-right font-medium">F1</th>
              </tr>
            </thead>
            <tbody>
              {m.per_class.map((c) => (
                <tr key={c.class} className="border-b border-line/50">
                  <td className="py-2 pr-4">
                    {c.class}
                    {c.support < SMALL_CLASS && <span className="ml-2 text-xs text-amber">few flows, treat with care</span>}
                  </td>
                  <td className="num py-2 pr-4 text-right">{fmt(c.support)}</td>
                  <td className="num py-2 pr-4 text-right">{percent(c.precision)}</td>
                  <td className="num py-2 pr-4 text-right">{percent(c.recall)}</td>
                  <td className="num py-2 text-right">{percent(c.f1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Reveal>
  )
}

function Metric({ label, value }) {
  if (value == null) return <Stat label={label} value="n/a" />
  return <Stat label={label} value={value * 100} format={(v) => `${v.toFixed(1)}%`} />
}
