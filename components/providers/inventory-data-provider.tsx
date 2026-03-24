"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { invalidateCwProductsCache } from "@/lib/cw-products-client-cache"
import { loadShopifySkus } from "@/lib/loadShopifySkus"
import type { BOMItem, DemandSource, InternalStockItem } from "@/lib/inventory-risk"

interface DashboardSnapshot {
  internalStockItems: InternalStockItem[]
  salesBySku: DemandSource
  assemblyByComponentSku: DemandSource
  bomData: BOMItem[]
  shopifySkuSet: Set<string>
}

interface InventoryDataValue {
  internalStockItems: InternalStockItem[]
  salesBySku: DemandSource
  assemblyByComponentSku: DemandSource
  bomData: BOMItem[]
  shopifySkuSet: Set<string>
  phase1Loading: boolean
  phase2Loading: boolean
  error: string | null
  load: () => void
  refresh: () => void
}

const InventoryDataContext = createContext<InventoryDataValue | null>(null)

let sessionSnapshot: DashboardSnapshot | null = null
let sessionLoadPromise: Promise<void> | null = null

async function fetchDashboardData(): Promise<DashboardSnapshot> {
  const [stockRes, salesRes, skuSet] = await Promise.all([
    fetch("/api/unleashed/internal-stock").then((res) =>
      res.json().then((body) => ({ ok: res.ok, body }))
    ),
    fetch("/api/unleashed/sales-trend").then((res) =>
      res.json().then((body) => ({ ok: res.ok, body }))
    ),
    loadShopifySkus(),
  ])

  if (!stockRes.ok) {
    throw new Error(
      stockRes.body?.detail || stockRes.body?.error || "Failed stock fetch"
    )
  }
  if (!salesRes.ok) {
    throw new Error(
      salesRes.body?.detail || salesRes.body?.error || "Failed sales fetch"
    )
  }

  const internalStockItems = Array.isArray(stockRes.body?.items)
    ? stockRes.body.items
    : []
  const salesBySku = salesRes.body?.bySku ?? {}

  let assemblyByComponentSku: DemandSource = {}
  let bomData: BOMItem[] = []

  try {
    const [assemblyRes, bomRes] = await Promise.all([
      fetch("/api/unleashed/assembly-trend").then((res) =>
        res.json().then((body) => ({ ok: res.ok, body }))
      ),
      fetch("/api/unleashed/boms").then((res) =>
        res.json().then((body) => ({ ok: res.ok, body }))
      ),
    ])
    if (assemblyRes.ok) {
      assemblyByComponentSku = assemblyRes.body?.byComponentSku ?? {}
    }
    if (bomRes.ok) {
      bomData = Array.isArray(bomRes.body?.Items) ? bomRes.body.Items : []
    }
  } catch (err) {
    console.warn(
      "[phase2] Enhancement fetch failed, table shows sales-only demand:",
      err
    )
  }

  return {
    internalStockItems,
    salesBySku,
    assemblyByComponentSku,
    bomData,
    shopifySkuSet: skuSet,
  }
}

function ensureSessionLoad(): Promise<void> {
  if (sessionLoadPromise) return sessionLoadPromise

  sessionLoadPromise = (async () => {
    try {
      sessionSnapshot = await fetchDashboardData()
    } finally {
      sessionLoadPromise = null
    }
  })()

  return sessionLoadPromise
}

export function InventoryDataProvider({ children }: { children: ReactNode }) {
  const [internalStockItems, setInternalStockItems] = useState<
    InternalStockItem[]
  >(() => sessionSnapshot?.internalStockItems ?? [])
  const [salesBySku, setSalesBySku] = useState<DemandSource>(
    () => sessionSnapshot?.salesBySku ?? {}
  )
  const [assemblyByComponentSku, setAssemblyByComponentSku] =
    useState<DemandSource>(() => sessionSnapshot?.assemblyByComponentSku ?? {})
  const [bomData, setBomData] = useState<BOMItem[]>(
    () => sessionSnapshot?.bomData ?? []
  )
  const [shopifySkuSet, setShopifySkuSet] = useState<Set<string>>(
    () => sessionSnapshot?.shopifySkuSet ?? new Set()
  )
  const [phase1Loading, setPhase1Loading] = useState(() => !sessionSnapshot)
  const [phase2Loading, setPhase2Loading] = useState(() => !sessionSnapshot)
  const [error, setError] = useState<string | null>(null)

  const hydrate = useCallback((snap: DashboardSnapshot) => {
    setInternalStockItems(snap.internalStockItems)
    setSalesBySku(snap.salesBySku)
    setAssemblyByComponentSku(snap.assemblyByComponentSku)
    setBomData(snap.bomData)
    setShopifySkuSet(snap.shopifySkuSet)
    setPhase1Loading(false)
    setPhase2Loading(false)
    setError(null)
  }, [])

  const load = useCallback(() => {
    if (sessionSnapshot) {
      hydrate(sessionSnapshot)
      return
    }

    setPhase1Loading(true)
    setPhase2Loading(true)
    setError(null)

    ensureSessionLoad()
      .then(() => {
        if (sessionSnapshot) hydrate(sessionSnapshot)
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load inventory data."
        setError(message)
        setPhase1Loading(false)
        setPhase2Loading(false)
      })
  }, [hydrate])

  const refresh = useCallback(() => {
    sessionSnapshot = null
    sessionLoadPromise = null
    invalidateCwProductsCache()
    setPhase1Loading(true)
    setPhase2Loading(true)
    setError(null)

    ensureSessionLoad()
      .then(() => {
        if (sessionSnapshot) hydrate(sessionSnapshot)
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load inventory data."
        setError(message)
        setPhase1Loading(false)
        setPhase2Loading(false)
      })
  }, [hydrate])

  const value = useMemo<InventoryDataValue>(
    () => ({
      internalStockItems,
      salesBySku,
      assemblyByComponentSku,
      bomData,
      shopifySkuSet,
      phase1Loading,
      phase2Loading,
      error,
      load,
      refresh,
    }),
    [
      internalStockItems,
      salesBySku,
      assemblyByComponentSku,
      bomData,
      shopifySkuSet,
      phase1Loading,
      phase2Loading,
      error,
      load,
      refresh,
    ]
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
