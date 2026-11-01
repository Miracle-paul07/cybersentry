import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api'

// The current analysis job. Its id is remembered in localStorage so a page
// refresh keeps the results (until the server restarts). Status is polled here,
// not on the scan page, so a job that finishes while you're on another page still
// unlocks the results.
const KEY = 'cybersentry.jobId'
const POLL_MS = 400
const RETRY_MS = 2000
const JobContext = createContext(null)

function readStored() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function store(id) {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    // storage blocked: the job just won't survive a refresh
  }
}

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
        if (s.status !== 'done' && s.status !== 'error') timer = setTimeout(poll, POLL_MS)
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
    ready: current?.status === 'done',
    running: Boolean(jobId) && (!current || ['queued', 'running'].includes(current.status)),
  }
  return <JobContext.Provider value={value}>{children}</JobContext.Provider>
}

export function useJob() {
  return useContext(JobContext)
}
