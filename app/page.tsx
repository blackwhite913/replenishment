"use client"

import { useState, useMemo, useEffect } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { TopNav } from "@/components/dashboard/top-nav"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { Filters } from "@/components/dashboard/filters"
import { RiskTable } from "@/components/dashboard/risk-table"
import { DetailPanel } from "@/components/dashboard/detail-panel"
import { skuData, type SkuItem } from "@/lib/placeholder-data"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"

export default function DashboardPage() {
  const [channel, setChannel] = useState("shop")
  const [leadTime, setLeadTime] = useState(3)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [minDaysCover, setMinDaysCover] = useState(0)
  const [selectedSku, setSelectedSku] = useState<SkuItem | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [internalStockItems, setInternalStockItems] = useState<
    { productCode: string; productDescription: string; internalStockTotal: number }[]
  >([])
  const [internalStockLoading, setInternalStockLoading] = useState(true)
  const [internalStockRetry, setInternalStockRetry] = useState(0)
  const [page, setPage] = useState(1)
  const [showZeroStock, setShowZeroStock] = useState(false)
  const PAGE_SIZE = 50

  useEffect(() => {
    setInternalStockLoading(true)
    fetch("/api/unleashed/internal-stock")
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (body?.items?.length) {
          setInternalStockItems(body.items)
        }
      })
      .catch(console.error)
      .finally(() => setInternalStockLoading(false))
  }, [internalStockRetry])

  const tableData = useMemo((): SkuItem[] => {
    if (internalStockItems.length > 0) {
      return internalStockItems.map((item) => ({
        sku: item.productCode,
        productName: item.productDescription,
        shopStock: item.internalStockTotal,
        dailySales: 0,
        daysCover: 0,
        reorderPoint: 0,
        thirdPlStock: 0,
        suggestedTransferQty: 0,
        status: "healthy" as const,
      }))
    }
    return skuData.map((sku) => ({ ...sku, shopStock: 0 }))
  }, [internalStockItems])

  const filteredData = useMemo(() => {
    return tableData.filter((item) => {
      const matchesSearch =
        searchQuery === "" ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.productName.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter

      const matchesDaysCover = item.daysCover >= minDaysCover

      const matchesStock = showZeroStock || item.shopStock > 0

      return matchesSearch && matchesStatus && matchesDaysCover && matchesStock
    })
  }, [searchQuery, statusFilter, minDaysCover, showZeroStock, tableData])

  const paginatedData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredData.slice(start, start + PAGE_SIZE)
  }, [filteredData, page])

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE) || 1

  useEffect(() => {
    setPage(1)
  }, [searchQuery, statusFilter, minDaysCover, showZeroStock])

  function handleRowClick(sku: SkuItem) {
    setSelectedSku(sku)
    setPanelOpen(true)
  }

  function handleRefresh() {
    setSearchQuery("")
    setStatusFilter("all")
    setMinDaysCover(0)
    setPage(1)
    setInternalStockRetry((k) => k + 1)
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        <TopNav
          channel={channel}
          onChannelChange={setChannel}
          leadTime={leadTime}
          onLeadTimeChange={setLeadTime}
          onRefresh={handleRefresh}
        />

        <main className="flex-1 p-5 lg:p-6 overflow-y-auto">
          <div className="flex flex-col gap-5 max-w-[1440px]">
            <KpiCards data={skuData} />

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Replenishment Risk Table
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {internalStockLoading ? (
                      "Loading internal stock..."
                    ) : (
                      <>
                        Click any row to view detailed analytics. Showing{" "}
                        <span className="font-semibold text-foreground">
                          {filteredData.length > 0
                            ? `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filteredData.length)}`
                            : "0"}
                        </span>{" "}
                        of{" "}
                        <span className="font-semibold text-foreground">{filteredData.length}</span>{" "}
                        {totalPages > 1 && `(page ${page}/${totalPages})`}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Channel:{" "}
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary capitalize">
                      {channel}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Lead time:{" "}
                    <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold text-foreground">
                      {leadTime} days
                    </span>
                  </span>
                </div>
              </div>

              <Filters
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                minDaysCover={minDaysCover}
                onMinDaysCoverChange={setMinDaysCover}
              />

              {internalStockLoading ? (
                <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center justify-center gap-4 min-h-[320px]">
                  <Spinner className="size-10 text-primary" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Loading internal stock from Unleashed...
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    Fetching U3 and U10 warehouse data
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showZeroStock}
                        onChange={(e) => setShowZeroStock(e.target.checked)}
                        className="rounded border-border bg-secondary"
                      />
                      <span className="text-xs text-muted-foreground">
                        Show zero stock items
                      </span>
                    </label>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                        >
                          Previous
                        </Button>
                        <span className="text-xs text-muted-foreground tabular-nums px-2">
                          Page {page} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                          }
                          disabled={page >= totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                  <RiskTable
                    data={paginatedData}
                    onRowClick={handleRowClick}
                  />
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      <DetailPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        selectedSku={selectedSku}
      />
    </div>
  )
}
