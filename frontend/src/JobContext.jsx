import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api'

// The current analysis job. Its id lasts for this visit only: it is kept in
// sessionStorage so refreshing a result page keeps the results, and it is forgotten
// when the site is loaded fresh at the landing page or in a new tab. Status is polled
// here, not on the scan page, so a job that finishes while you're on another page
// still unlocks the results. Polling carries on after results unlock, slower, because
// the incident reports keep arriving in the background, and after the job ends, so a
// server restart locks the pages again.
const KEY = 'cybersentry.jobId'
const POLL_MS = 400
const REPORTS_POLL_MS = 1500
const FINISHED_POLL_MS = 5000
const RETRY_MS = 2000
const JobContext = createContext(null)

function readStored() {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

function store(id) {
  try {
    if (id) sessionStorage.setItem(KEY, id)
    else sessionStorage.removeItem(KEY)
  } catch {
    // storage blocked: the job just won't survive a refresh
  }
}

try {
  localStorage.removeItem(KEY) // older versions kept the job across visits
} catch {
  // storage blocked: there is nothing to remove
}
if (window.location.pathname === '/') store(null)

export function JobProvider({ children }) {
  const [jobId, setJobIdState] = useState(readStored)
  const [job, setJob] = useState(null) // latest status snapshot from /api/jobs/{id}
  const [checking, setChecking] = useState(() => Boolean(readStored()))
  const [lostJob, setLostJob] = useState(null) // id the server no longer knows about
  const [pollError, setPollError] = useState(null)

  const setJobId = useCallback((id) => {
    store(id)
    setJobIdState(id)
    setJob(null)
    setPollError(null)
  }, [])

  useEffect(() => {
    if (!jobId) return
    let timer
    let cancelled = false
    async function poll() {
      try {
        const s = await api.job(jobId)
        if (cancelled) return
        setJob(s)
        setPollError(null)
        setChecking(false)
        const finished = s.status === 'done' || s.status === 'error'
        timer = setTimeout(poll, finished ? FINISHED_POLL_MS : s.results_ready ? REPORTS_POLL_MS : POLL_MS)
      } catch (e) {
        if (cancelled) return
        setChecking(false)
        if (e.status === 404) {
          setLostJob(jobId)
          setJobId(null)
        } else {
          setPollError(e.message) // server unreachable: keep trying
          timer = setTimeout(poll, RETRY_MS)
        }
      }
    }
    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [jobId, setJobId])

  const current = job?.job_id === jobId ? job : null
  const value = {
    jobId,
    job: current,
    setJobId,
    checking,
    lostJob,
    pollError,
    ready: Boolean(current?.results_ready),
    running: Boolean(jobId) && (!current || (['queued', 'running'].includes(current.status) && !current.results_ready)),
    reports: current?.reports ?? [],
    reportsPending: current?.status === 'running' && Boolean(current?.results_ready),
  }
  return <JobContext.Provider value={value}>{children}</JobContext.Provider>
}

export function useJob() {
  return useContext(JobContext)
}
