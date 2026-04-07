"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Spinner } from "@/components/ui/spinner"
import {
  getCwProductsCached,
  invalidateCwProductsCache,
  type CwInventoryResponse,
} from "@/lib/cw-products-client-cache"

export default function StockOnHandPage() {
  const [data, setData] = useState<CwInventoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)

    getCwProductsCached()
      .then(setData)
      .catch((fetchError: unknown) => {
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load CW warehouse inventory."
        setError(message)
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [retryKey])

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-6 py-3">
            <MobileNav />
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              Back
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                Stock on Hand
              </h1>
              <p className="text-xs text-muted-foreground">
                CW Logistics Inventory · Unleashed Products
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-6 overflow-y-auto">
          <div className="flex flex-col gap-5 max-w-[1440px]">
            {(loading || !data) && !error && (
              <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center justify-center gap-3 min-h-[200px]">
                <Spinner className="size-8 text-primary/70" />
                <p className="text-sm text-muted-foreground">Loading CW stock...</p>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    invalidateCwProductsCache()
                    setRetryKey((value) => value + 1)
                  }}
                >
                  Retry
                </Button>
              </div>
            )}

            {!loading && !error && data && (() => {
              const items = data.items
              const skuCount = items.length
              const totalStockOnHand = items.reduce((sum, item) => sum + item.qtyOnHand, 0)

              if (items.length === 0) {
                return (
                  <div className="rounded-xl border border-border bg-card p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No CW warehouse inventory found. Check Per Warehouse Controls / API permissions / include=InventoryDetail.
                    </p>
                  </div>
                )
              }

              return (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-border bg-secondary/40 hover:bg-secondary/40">
                          <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Product Code
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Description
                          </TableHead>
                          <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Qty on Hand
                          </TableHead>
                          <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Allocated
                          </TableHead>
                          <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Available
                          </TableHead>
                          <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Avg Cost
                          </TableHead>
                          <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Total Cost
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow
                            key={`${item.productCode}-${item.warehouseName}-${idx}`}
                            className="border-b border-border/50 transition-colors hover:bg-secondary/30"
                          >
                            <TableCell className="font-mono text-xs font-bold text-primary">
                              {item.productCode}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate text-sm text-foreground">
                              {item.productDescription}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium text-foreground">
                              {item.qtyOnHand.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                              {item.allocatedQty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                              {item.availableQty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                              {item.avgCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                              {item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
                    Showing {skuCount} rows · Total qty on hand: {totalStockOnHand.toLocaleString()}
                  </p>
                </div>
              )
            })()}
          </div>
        </main>
      </div>
    </div>
  )
}
