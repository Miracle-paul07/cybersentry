import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, CustomChart, PieChart, ScatterChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  CustomChart,
  PieChart,
  ScatterChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
])

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// `option` should be memoised by the caller: every new object redraws the chart.
export default function EChart({ option, height = 280, onClick, label }) {
  const el = useRef(null)
  const chart = useRef(null)

  useEffect(() => {
    const c = echarts.init(el.current)
    chart.current = c
    const observer = new ResizeObserver(() => c.resize())
    observer.observe(el.current)
    return () => {
      observer.disconnect()
      c.dispose()
    }
  }, [])

  useEffect(() => {
    const full = {
      animation: !reducedMotion(),
      aria: { enabled: true },
      textStyle: { fontFamily: '"Inter Variable", system-ui, sans-serif' },
      ...option,
    }
    chart.current.setOption(full, true)
    // Canvas text can't swap fonts by itself, so redraw once the bundled fonts are ready
    let stale = false
    document.fonts?.ready.then(() => {
      if (!stale && chart.current && !chart.current.isDisposed()) chart.current.setOption(full, true)
    })
    return () => {
      stale = true
    }
  }, [option])

  useEffect(() => {
    const c = chart.current
    c.off('click')
    if (onClick) c.on('click', onClick)
  }, [onClick])

  return <div ref={el} role="img" aria-label={label} style={{ height }} className="w-full" />
}
