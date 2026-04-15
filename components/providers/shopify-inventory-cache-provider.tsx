"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export interface DebugVariant {
  id: number | string
  title: string
  sku: string | null
  barcode: string | null
  price: string | null
  inventory_quantity: number | null
  inventory_item_id: number | string | null
  option1: string | null
  option2: string | null
  option3: string | null
}

export interface ShopifyProductRow {
  id: number | string
  title: string
  handle: string
  status: string
  vendor: string
  product_type: string
  tags: string
  created_at: string
  updated_at: string
  published_at: string | null
  variants: DebugVariant[]
}

export interface ShopifyInventoryMeta {
  duration?: number
  totalProducts?: number
  totalVariants?: number
  pagesFetched?: number
  source?: string
}

interface ShopifyInventoryApiBody {
  success: boolean
  data?: {
    products?: ShopifyProductRow[]
  }
  error?: boolean
  message?: string
  details?: string
  meta?: ShopifyInventoryMeta
}

export interface ShopifyInventorySnapshot {
  products: ShopifyProductRow[]
  meta: ShopifyInventoryMeta
}

interface ShopifyInventoryCacheValue {
  products: ShopifyProductRow[]
  meta: ShopifyInventoryMeta
  /** True while fetching or waiting for first load to finish (no snapshot, no error yet). */
  isPending: boolean
  loading: boolean
  error: string | null
  load: () => void
  refresh: () => void
}

const ShopifyInventoryCacheContext =
  createContext<ShopifyInventoryCacheValue | null>(null)

export function ShopifyInventoryCacheProvider({
  children,
}: {
  children: ReactNode
}) {
  const [snapshot, setSnapshot] = useState<ShopifyInventorySnapshot | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runFetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/test/shopify")
      const body = (await res.json()) as ShopifyInventoryApiBody

      if (!res.ok || body.error) {
        throw new Error(
          body.details ||
            body.message ||
            "Failed to load Shopify products."
        )
      }

      const rows = Array.isArray(body.data?.products) ? body.data.products : []

      setSnapshot({
        products: rows,
        meta: {
          duration: body.meta?.duration,
          totalProducts: body.meta?.totalProducts,
          totalVariants: body.meta?.totalVariants,
          pagesFetched: body.meta?.pagesFetched,
          source: body.meta?.source,
        },
      })
    } catch (fetchError: unknown) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load Shopify products."
      setError(message)
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const load = useCallback(() => {
    if (snapshot) return
    void runFetch()
  }, [snapshot, runFetch])

  const refresh = useCallback(() => {
    setSnapshot(null)
    void runFetch()
  }, [runFetch])

  const value = useMemo<ShopifyInventoryCacheValue>(() => {
    const isPending = loading || (snapshot === null && error === null)
    return {
      products: snapshot?.products ?? [],
      meta: snapshot?.meta ?? {},
      isPending,
      loading,
      error,
      load,
      refresh,
    }
  }, [snapshot, loading, error, load, refresh])

  return (
    <ShopifyInventoryCacheContext.Provider value={value}>
      {children}
    </ShopifyInventoryCacheContext.Provider>
  )
}

export function useShopifyInventoryCache(): ShopifyInventoryCacheValue {
  const ctx = useContext(ShopifyInventoryCacheContext)
  if (!ctx) {
    throw new Error(
      "useShopifyInventoryCache must be used within ShopifyInventoryCacheProvider"
    )
  }
  return ctx
}
