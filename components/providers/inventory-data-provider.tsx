"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { SkuItem } from "@/lib/placeholder-data"
import { enrichItems, type BomDetail } from "@/lib/build-dashboard"
import type { AssemblyTrendResult } from "@/lib/unleashed-assemblies"
import type { LightBomLine } from "@/lib/unleashed-bom-light"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoreMeta {
  generatedAt: string
  durationMs: number
  stockRows: number
  matchedRows: number
  unmatchedRows: number
  shopifyVariantSkus: number
  shopifyRawVariants: number
  shopifyReady: boolean
  threePlAvailable: boolean
  cached: boolean
  enriched: boolean
  leadTime: number
}

interface CoreResponse {
  items: SkuItem[]
  meta: CoreMeta
}

interface EnrichmentResponse {
  salesBySku: Record<string, { total90Days: number; dailyAverage: number }>
  assemblyTrend: AssemblyTrendResult
  bomLite: LightBomLine[]
  errors: Array<{ source: string; message: string; recoverable: boolean }> | null
  meta: {
    durationMs: number
    cached: boolean
    degraded: boolean
    salesSkus: number
    assemblySkus: number
    bomLines: number
  }
}

interface InventoryDataValue {
  items: SkuItem[]
  bomVisibility: Record<string, BomDetail[]>
  meta: CoreMeta | null
  loading: boolean
  enriching: boolean
  error: string | null
  enrichmentErrors: Array<{ source: string; message: string }> | null
  load: (leadTime?: number) => void
  refresh: (leadTime?: number) => void
}

// ---------------------------------------------------------------------------
// Session-level module cache (survives navigation, cleared on hard refresh)
// ---------------------------------------------------------------------------

interface SnapshotEntry {
  items: SkuItem[]
  bomVisibility: Record<string, BomDetail[]>
  meta: CoreMeta
  degraded: boolean
  fetchedAt: number
}

const SESSION_STORAGE_KEY = "dashboard-v2"
const STALE_AFTER_MS = 5 * 60 * 1000

let sessionSnapshot: SnapshotEntry | null = null
let coreLoadPromise: Promise<void> | null = null

function readSessionStorage(): SnapshotEntry | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SnapshotEntry
  } catch {
    return null
  }
}

function writeSessionStorage(entry: SnapshotEntry): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // quota exceeded
  }
}

function clearSessionStorage(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchCore(leadTime: number, forceRefresh: boolean): Promise<CoreResponse> {
  const params = new URLSearchParams({ leadTime: String(leadTime) })
  if (forceRefresh) params.set("refresh", "1")
  const res = await fetch(`/api/dashboard-core?${params.toString()}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body?.detail || body?.error || "Core load failed")
  return body as CoreResponse
}

async function fetchEnrichment(forceRefresh: boolean): Promise<EnrichmentResponse> {
  const params = new URLSearchParams()
  if (forceRefresh) params.set("refresh", "1")
  const res = await fetch(`/api/dashboard-enrichment?${params.toString()}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body?.detail || body?.error || "Enrichment load failed")
  return body as EnrichmentResponse
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const InventoryDataContext = createContext<InventoryDataValue | null>(null)

export function InventoryDataProvider({ children }: { children: ReactNode }) {
  // Only use module-level snapshot for SSR-safe initial state (never sessionStorage)
  const [items, setItems] = useState<SkuItem[]>(() => sessionSnapshot?.items ?? [])
  const [bomVisibility, setBomVisibility] = useState<Record<string, BomDetail[]>>(
    () => sessionSnapshot?.bomVisibility ?? {}
  )
  const [meta, setMeta] = useState<CoreMeta | null>(() => sessionSnapshot?.meta ?? null)
  const [loading, setLoading] = useState(() => sessionSnapshot === null)
  const [enriching, setEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enrichmentErrors, setEnrichmentErrors] = useState<Array<{ source: string; message: string }> | null>(null)
  const didHydrateFromStorage = useRef(false)

  const hydrateSnapshot = useCallback((entry: SnapshotEntry) => {
    setItems(entry.items)
    setBomVisibility(entry.bomVisibility)
    setMeta(entry.meta)
    setLoading(false)
    setError(null)
    writeSessionStorage(entry)
    sessionSnapshot = entry
  }, [])

  useEffect(() => {
    if (didHydrateFromStorage.current || sessionSnapshot) return
    didHydrateFromStorage.current = true
    const persisted = readSessionStorage()
    if (persisted) {
      hydrateSnapshot(persisted)
    }
  }, [hydrateSnapshot])

  const runEnrichment = useCallback(
    (coreItems: SkuItem[], coreMeta: CoreMeta, forceRefresh: boolean) => {
      setEnriching(true)
      fetchEnrichment(forceRefresh)
        .then((enrichment) => {
          const { items: enrichedItems, bomVisibility: bv } = enrichItems(coreItems, {
            salesSummaryBySku: enrichment.salesBySku,
            assemblyTrend: enrichment.assemblyTrend,
            bomLines: enrichment.bomLite,
            leadTime: coreMeta.leadTime,
          })

          const nextMeta: CoreMeta = {
            ...coreMeta,
            enriched: true,
          }

          setItems(enrichedItems)
          setBomVisibility(bv)
          setMeta(nextMeta)
          setEnrichmentErrors(
            enrichment.errors?.map((e) => ({ source: e.source, message: e.message })) ?? null
          )
          const entry: SnapshotEntry = {
            items: enrichedItems,
            bomVisibility: bv,
            meta: nextMeta,
            degraded: enrichment.meta.degraded,
            fetchedAt: Date.now(),
          }
          writeSessionStorage(entry)
          sessionSnapshot = entry
        })
        .catch((err) => {
          console.warn("[inventory-data-provider] enrichment failed:", err)
          setEnrichmentErrors([{ source: "enrichment", message: err instanceof Error ? err.message : String(err) }])
        })
        .finally(() => setEnriching(false))
    },
    []
  )

  const load = useCallback(
    (leadTime = 3) => {
      if (sessionSnapshot) {
        const age = Date.now() - sessionSnapshot.fetchedAt
        hydrateSnapshot(sessionSnapshot)
        if (age > STALE_AFTER_MS || sessionSnapshot.degraded) {
          fetchCore(leadTime, false)
            .then((core) => {
              setItems(core.items)
              setMeta(core.meta)
              setLoading(false)
              runEnrichment(core.items, core.meta, false)
            })
            .catch(() => {})
        }
        return
      }

      const persisted = readSessionStorage()
      if (persisted) {
        hydrateSnapshot(persisted)
        fetchCore(leadTime, false)
          .then((core) => {
            setItems(core.items)
            setMeta(core.meta)
            runEnrichment(core.items, core.meta, false)
          })
          .catch(() => {})
        return
      }

      if (coreLoadPromise) return

      setLoading(true)
      setError(null)

      coreLoadPromise = fetchCore(leadTime, false)
        .then((core) => {
          setItems(core.items)
          setMeta(core.meta)
          setLoading(false)
          setError(null)

          const entry: SnapshotEntry = {
            items: core.items,
            bomVisibility: {},
            meta: core.meta,
            degraded: false,
            fetchedAt: Date.now(),
          }
          sessionSnapshot = entry

          runEnrichment(core.items, core.meta, false)
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Failed to load dashboard data.")
          setLoading(false)
        })
        .finally(() => {
          coreLoadPromise = null
        })
    },
    [hydrateSnapshot, runEnrichment]
  )

  const refresh = useCallback(
    (leadTime = 3) => {
      sessionSnapshot = null
      coreLoadPromise = null
      clearSessionStorage()
      setLoading(true)
      setError(null)
      setEnrichmentErrors(null)

      fetchCore(leadTime, true)
        .then((core) => {
          setItems(core.items)
          setMeta(core.meta)
          setLoading(false)
          setError(null)
          runEnrichment(core.items, core.meta, true)
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Failed to refresh dashboard data.")
          setLoading(false)
        })
    },
    [runEnrichment]
  )

  const value = useMemo<InventoryDataValue>(
    () => ({
      items,
      bomVisibility,
      meta,
      loading,
      enriching,
      error,
      enrichmentErrors,
      load,
      refresh,
    }),
    [items, bomVisibility, meta, loading, enriching, error, enrichmentErrors, load, refresh]
  )

  return (
    <InventoryDataContext.Provider value={value}>
      {children}
    </InventoryDataContext.Provider>
  )
}

export function useInventoryData(): InventoryDataValue {
  const ctx = useContext(InventoryDataContext)
  if (!ctx) {
    throw new Error("useInventoryData must be used within InventoryDataProvider")
  }
  return ctx
}
