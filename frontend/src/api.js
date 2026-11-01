// Thin wrapper around the FastAPI backend. Errors carry the backend's message.

export class ApiError extends Error {
  constructor(message, status, detail = {}) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

async function request(path, options) {
  let res
  try {
    res = await fetch(path, options)
  } catch {
    throw new ApiError('Cannot reach the CyberSentry server. Is it running?', 0)
  }
  if (!res.ok) {
    let detail = {}
    try {
      detail = (await res.json()).detail ?? {}
    } catch {
      // not JSON
    }
    throw new ApiError(detail.message ?? `Request failed (${res.status})`, res.status, detail)
  }
  return res.json()
}

function query(params = {}) {
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return clean.length ? `?${new URLSearchParams(clean)}` : ''
}

const enc = encodeURIComponent

export const api = {
  health: () => request('/api/health'),
  analyze: (file) => {
    const body = new FormData()
    body.append('file', file)
    return request('/api/analyze', { method: 'POST', body })
  },
  analyzeSample: () => request('/api/analyze/sample', { method: 'POST' }),
  job: (id) => request(`/api/jobs/${id}`),
  results: (id, params) => request(`/api/jobs/${id}/results${query(params)}`),
  flow: (id, row) => request(`/api/jobs/${id}/flows/${row}`),
  attacks: (id) => request(`/api/jobs/${id}/analysis`),
  attack: (id, type) => request(`/api/jobs/${id}/analysis/${enc(type)}`),
  reports: (id) => request(`/api/jobs/${id}/reports`),
  report: (id, type) => request(`/api/jobs/${id}/reports/${enc(type)}`),
}

export const urls = {
  flowsCsv: (id, params) => `/api/jobs/${id}/flows.csv${query(params)}`,
  reportFile: (id, type, ext) => `/api/jobs/${id}/reports/${enc(type)}.${ext}`,
}
