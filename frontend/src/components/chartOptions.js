// ECharts options shared by the pages. Thin marks, hairline grid, text in text
// colours (never the series colour), one axis per chart.
import { RISK_COLORS, RISK_LEVELS, fmt, fmtValue } from '../risk'

const TEXT = '#e6ebff'
const MUTED = '#8a94b3'
const LINE = '#1a2236'
const SURFACE = '#090d18'
const MONO = '"JetBrains Mono Variable", ui-monospace, Consolas, monospace'

export const SERIES = { threat: RISK_COLORS.Critical, system: RISK_COLORS.Low }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const tooltip = {
  backgroundColor: '#0e1424',
  borderColor: LINE,
  borderWidth: 1,
  padding: [8, 12],
  confine: true,
  textStyle: { color: TEXT, fontSize: 12 },
}

const row = (color, label, value) =>
  `<div style="display:flex;align-items:center;gap:8px;margin-top:2px">
     <span style="width:10px;height:2px;background:${color}"></span>
     <b style="font-family:${MONO}">${esc(value)}</b>
     <span style="color:${MUTED}">${esc(label)}</span>
   </div>`

const title = (s) => `<div style="color:${MUTED};margin-bottom:2px">${esc(s)}</div>`

const compact = (v) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

const axisLabel = { color: MUTED, fontSize: 11, fontFamily: MONO }
const splitLine = { lineStyle: { color: LINE, width: 1, type: 'solid' } }
const axisLine = { lineStyle: { color: LINE } }

export function riskDonut(riskCounts) {
  return {
    tooltip: {
      ...tooltip,
      trigger: 'item',
      formatter: (p) => title(p.name) + row(p.color, `flows (${p.percent}%)`, fmt(p.value)),
    },
    series: [
      {
        type: 'pie',
        radius: ['66%', '88%'],
        minAngle: 4,
        label: { show: false },
        itemStyle: { borderColor: SURFACE, borderWidth: 2, borderRadius: 4 },
        emphasis: { scale: true, scaleSize: 4 },
        data: RISK_LEVELS.map((level) => ({
          name: level,
          value: riskCounts[level],
          itemStyle: { color: RISK_COLORS[level] },
        })),
      },
    ],
  }
}

export function attackBars(attacks) {
  return {
    grid: { left: 4, right: 44, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(138,148,179,0.08)' } },
      formatter: ([p]) => title(p.name) + row(SERIES.threat, 'flows', fmt(p.value)),
    },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      inverse: true,
      triggerEvent: true,
      data: attacks.map((a) => a.attack_type),
      axisTick: { show: false },
      axisLine,
      axisLabel: { color: TEXT, fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 14,
        cursor: 'pointer',
        data: attacks.map((a) => a.count),
        itemStyle: { color: SERIES.threat, borderRadius: [0, 4, 4, 0] },
        emphasis: { itemStyle: { color: '#fb7185' } },
        label: { show: true, position: 'right', color: MUTED, fontFamily: MONO, fontSize: 11, formatter: (p) => fmt(p.value) },
      },
    ],
  }
}

export function histogramColumns(hist, { color = SERIES.system, axisName, digits = 2 } = {}) {
  const bins = hist.counts.map((_, i) => ({ from: hist.edges[i], to: hist.edges[i + 1] }))
  return {
    grid: { left: 8, right: 8, top: 22, bottom: 26, containLabel: true },
    tooltip: {
      ...tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(138,148,179,0.08)' } },
      formatter: ([p]) => {
        const b = bins[p.dataIndex]
        const range = b.from === b.to ? b.from.toFixed(digits) : `${b.from.toFixed(digits)} to ${b.to.toFixed(digits)}`
        return title(`${axisName}: ${range}`) + row(color, 'flows', fmt(p.value))
      },
    },
    xAxis: {
      type: 'category',
      name: axisName,
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { color: MUTED, fontSize: 11 },
      data: bins.map((b) => b.from.toFixed(digits)),
      axisTick: { show: false },
      axisLine,
      axisLabel,
    },
    yAxis: { type: 'value', axisLabel: { ...axisLabel, formatter: compact }, splitLine, minInterval: 1 },
    series: [
      {
        type: 'bar',
        barCategoryGap: '6%',
        barMaxWidth: 64,
        data: hist.counts,
        itemStyle: { color, borderRadius: [4, 4, 0, 0] },
        label: {
          show: true,
          position: 'top',
          color: MUTED,
          fontFamily: MONO,
          fontSize: 11,
          formatter: (p) => (p.value ? fmt(p.value) : ''),
        },
      },
    ],
  }
}

// Colour is the share of the true class (one hue, dark to bright), so a small class
// reads as clearly as a big one. Each cell's text is the flow count.
export function confusionHeatmap({ true: rows, predicted, matrix }) {
  const totals = matrix.map((r) => r.reduce((a, b) => a + b, 0))
  const data = matrix.flatMap((r, y) =>
    r.map((n, x) => {
      const share = totals[y] ? n / totals[y] : 0
      return { value: [x, y, share, n], label: { color: share > 0.55 ? SURFACE : TEXT } }
    }),
  )
  return {
    grid: { left: 8, right: 44, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltip,
      trigger: 'item',
      formatter: (p) => {
        const [x, y, share, n] = p.value
        return title(`True ${rows[y]}, predicted ${predicted[x]}`) + row(p.color, `flows (${(share * 100).toFixed(1)}% of ${rows[y]})`, fmt(n))
      },
    },
    visualMap: {
      show: false,
      min: 0,
      max: 1,
      dimension: 2,
      inRange: { color: ['#0e1424', '#0e4a5c', '#22d3ee'] },
    },
    xAxis: {
      type: 'category',
      data: predicted,
      axisTick: { show: false },
      axisLine,
      axisLabel: { color: TEXT, fontSize: 11, rotate: 40, interval: 0 },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows,
      axisTick: { show: false },
      axisLine,
      axisLabel: { color: TEXT, fontSize: 12 },
    },
    series: [
      {
        type: 'heatmap',
        data,
        itemStyle: { borderColor: SURFACE, borderWidth: 2, borderRadius: 2 },
        emphasis: { itemStyle: { borderColor: TEXT, borderWidth: 1 } },
        label: {
          show: true,
          fontFamily: MONO,
          fontSize: 10,
          formatter: (p) => (p.value[3] ? compact(p.value[3]) : ''),
        },
      },
    ],
  }
}

// Two dots per feature on a log axis, joined by a line. Bars would need a baseline,
// and a log scale has no meaningful zero to grow from.
export function featureDumbbell(rows, attackType) {
  const positive = rows.flatMap((r) => [r.attack_mean, r.benign_mean]).filter((v) => v > 0)
  const min = positive.length ? 10 ** Math.floor(Math.log10(Math.min(...positive))) : 1
  let max = positive.length ? 10 ** Math.ceil(Math.log10(Math.max(...positive))) : 10
  if (max === min) max = min * 10

  const point = (v, r) => [v > 0 ? v : null, r.feature]
  const byFeature = Object.fromEntries(rows.map((r) => [r.feature, r]))
  const dots = (name, color, key) => ({
    name,
    type: 'scatter',
    symbolSize: 12,
    z: 3,
    itemStyle: { color, borderColor: SURFACE, borderWidth: 2 },
    data: rows.map((r) => point(r[key], r)),
  })

  return {
    grid: { left: 8, right: 28, top: 36, bottom: 8, containLabel: true },
    legend: {
      top: 0,
      left: 8,
      icon: 'circle',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: TEXT, fontSize: 12 },
      data: [attackType, 'BENIGN'],
    },
    tooltip: {
      ...tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', axis: 'y', shadowStyle: { color: 'rgba(138,148,179,0.08)' } },
      formatter: (params) => {
        const r = byFeature[params[0].axisValue]
        return (
          title(`${r.feature} (mean)`) +
          row(SERIES.threat, attackType, fmtValue(r.attack_mean)) +
          row(SERIES.system, 'BENIGN', fmtValue(r.benign_mean))
        )
      },
    },
    xAxis: {
      type: 'log',
      logBase: 10,
      min,
      max,
      position: 'top',
      axisLabel: { ...axisLabel, formatter: compact },
      axisLine: { show: false },
      splitLine,
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((r) => r.feature),
      axisTick: { show: false },
      axisLine,
      axisLabel: { color: TEXT, fontSize: 12 },
    },
    series: [
      {
        type: 'custom',
        silent: true,
        tooltip: { show: false },
        encode: { x: [0, 1], y: 2 },
        data: rows.map((r, i) => [r.attack_mean, r.benign_mean, i]),
        renderItem: (_, api) => {
          const [a, b, i] = [api.value(0), api.value(1), api.value(2)]
          if (!(a > 0 && b > 0)) return null
          const start = api.coord([a, i])
          const end = api.coord([b, i])
          return {
            type: 'line',
            shape: { x1: start[0], y1: start[1], x2: end[0], y2: end[1] },
            style: { stroke: '#3a4768', lineWidth: 2 },
          }
        },
      },
      dots(attackType, SERIES.threat, 'attack_mean'),
      dots('BENIGN', SERIES.system, 'benign_mean'),
    ],
  }
}
