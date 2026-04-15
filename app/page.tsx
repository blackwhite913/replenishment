"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { TopNav } from "@/components/dashboard/top-nav"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { Filters } from "@/components/dashboard/filters"
import { RiskTable } from "@/components/dashboard/risk-table"
import { DetailPanel } from "@/components/dashboard/detail-panel"
import type { SkuItem } from "@/lib/placeholder-data"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Download, RefreshCw } from "lucide-react"
import { useInventoryData } from "@/components/providers/inventory-data-provider"

// ---------------------------------------------------------------------------
// CSV exports
// ---------------------------------------------------------------------------

function exportToCSV(rows: SkuItem[]) {
  const headers = [
    "SKU",
    "Product",
    "Shop Stock",
    "Daily Demand",
    "Days Cover",
    "Reorder Point",
    "3PL Stock",
    "Status",
    "Sales Demand (90d)",
    "Assembly Demand (90d)",
    "Total Demand (90d)",
    "Demand Type",
    "Is Component",
  ]
  const escape = (v: string | number | boolean | null | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`
  const csvRows = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.sku,
        r.productName,
        r.shopStock,
        r.dailySales,
        r.daysCover,
        r.reorderPoint,
        r.thirdPlStock,
        r.status,
        r.salesDemand ?? 0,
        r.assemblyDemand ?? 0,
        r.totalDemand ?? 0,
        r.demandType ?? "",
        r.isComponent ? "Yes" : "No",
      ]
        .map(escape)
        .join(",")
    ),
  ].join("\n")
  const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `stockly_inventory_risk_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

interface BomParentExportRow {
  sku: string
  productName: string
  bomParentCount: number
}

function exportBomParentsToCSV(rows: BomParentExportRow[]) {
  const headers = ["SKU", "Product Name", "Used In BOMs"]
  const escape = (v: string | number | boolean | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      [row.sku, row.productName, row.bomParentCount].map(escape).join(",")
    ),
  ].join("\n")
  const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `stockly_bom_parents_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

export default function DashboardPage() {
  const [leadTime, setLeadTime] = useState(3)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [productTypeFilter, setProductTypeFilter] = useState("all")
  const [demandTypeFilter, setDemandTypeFilter] = useState("all")
  const [selectedSku, setSelectedSku] = useState<SkuItem | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [showZeroStock, setShowZeroStock] = useState(false)
  const [showOnlyWithCwStock, setShowOnlyWithCwStock] = useState(false)

  const { items, bomVisibility, meta, loading, enriching, error, enrichmentErrors, load, refresh } =
    useInventoryData()
  const threePlUnavailable = meta?.threePlAvailable === false
  const provisionalKpis = !meta?.enriched || enriching
  const dashboardWarnings = useMemo(() => {
    const warnings: string[] = []
    if (enrichmentErrors && enrichmentErrors.length > 0) {
      warnings.push(...enrichmentErrors.map((e) => e.source))
    }
    if (threePlUnavailable) warnings.push("3PL")
    return warnings
  }, [enrichmentErrors, threePlUnavailable])

  useEffect(() => {
    load(leadTime)
  }, [load, leadTime])

  useEffect(() => {
    if (threePlUnavailable && showOnlyWithCwStock) {
      setShowOnlyWithCwStock(false)
    }
  }, [threePlUnavailable, showOnlyWithCwStock])

  const handleRefresh = useCallback(() => {
    refresh(leadTime)
  }, [refresh, leadTime])

  // ---------------------------------------------------------------------------
  // BOM parents export (derived from items)
  // ---------------------------------------------------------------------------
  const bomParentExportRows = useMemo((): BomParentExportRow[] => {
    const parentMap = new Map<string, { productName: string; count: number }>()
    for (const item of items) {
      for (const parentSku of item.bomParents ?? []) {
        const existing = parentMap.get(parentSku)
        if (existing) {
          existing.count += 1
        } else {
          parentMap.set(parentSku, { productName: parentSku, count: 1 })
        }
      }
    }
    return Array.from(parentMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sku, { productName, count }]) => ({
        sku,
        productName,
        bomParentCount: count,
      }))
  }, [items])

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  const filteredData = useMemo(() => {
    const result = items.filter((item) => {
      const matchesSearch =
        searchQuery === "" ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.productName.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter

      const matchesProductType =
        productTypeFilter === "all" ||
        (productTypeFilter === "component" && item.isComponent) ||
        (productTypeFilter === "standard" && !item.isComponent)

      const matchesDemandType =
        demandTypeFilter === "all" || item.demandType === demandTypeFilter

      const matchesStock = showZeroStock || item.shopStock > 0
      const matchesCwStock =
        !showOnlyWithCwStock ||
        ((meta?.threePlAvailable ?? true) && (item.thirdPlStock ?? 0) > 0)

      return (
        matchesSearch &&
        matchesStatus &&
        matchesProductType &&
        matchesDemandType &&
        matchesStock &&
        matchesCwStock
      )
    })
    return result
  }, [
    items,
    searchQuery,
    statusFilter,
    productTypeFilter,
    demandTypeFilter,
    showZeroStock,
    showOnlyWithCwStock,
    meta?.threePlAvailable,
  ])

  const paginatedData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredData.slice(start, start + PAGE_SIZE)
  }, [filteredData, page])

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE) || 1

  useEffect(() => {
    setPage(1)
  }, [
    searchQuery,
    statusFilter,
    productTypeFilter,
    demandTypeFilter,
    showZeroStock,
    showOnlyWithCwStock,
  ])

  function handleRowClick(sku: SkuItem) {
    setSelectedSku(sku)
    setPanelOpen(true)
  }

  function handleKpiClick(cardKey: "atRisk" | "monitoring" | "threePl") {
    if (cardKey === "atRisk") {
      setStatusFilter("oosRisk")
    } else if (cardKey === "monitoring") {
      setStatusFilter("monitoring")
    } else if (cardKey === "threePl" && !threePlUnavailable) {
      setShowOnlyWithCwStock(true)
    }
    setPage(1)
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        <TopNav leadTime={leadTime} onLeadTimeChange={setLeadTime} />

        <main className="flex-1 p-5 lg:p-6 overflow-y-auto">
          <div className="flex flex-col gap-5 max-w-[1440px]">
            <KpiCards
              data={items}
              totalSkuCount={items.length}
              provisional={provisionalKpis}
              threePlAvailable={!threePlUnavailable}
              onCardClick={handleKpiClick}
            />
            <p className="text-xs text-muted-foreground -mt-1">
              {meta ? (
                <>
                  {meta.shopifyVariantSkus.toLocaleString()} usable SKUs
                  {" · "}
                  {(meta.shopifyRawVariants ?? meta.shopifyVariantSkus).toLocaleString()} total variants
                  {" · "}{items.length.toLocaleString()} analyzed
                  {!meta.shopifyReady && (
                    <span className="ml-2 text-amber-600 dark:text-amber-400">
                      · SKU catalogue loading
                    </span>
                  )}
                  {threePlUnavailable && (
                    <span className="ml-2 text-amber-600 dark:text-amber-400">
                      · 3PL data unavailable
                    </span>
                  )}
                </>
              ) : (
                <>&nbsp;</>
              )}
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Replenishment Risk Table
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {loading ? (
                      "Loading stock data..."
                    ) : (
                      <>
                        Click any row to view detailed analytics. Showing{" "}
                        <span className="font-semibold text-foreground">
                          {filteredData.length > 0
                            ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                                page * PAGE_SIZE,
                                filteredData.length
                              )}`
                            : "0"}
                        </span>{" "}
                        of{" "}
                        <span className="font-semibold text-foreground">
                          {filteredData.length}
                        </span>{" "}
                        {totalPages > 1 && `(page ${page}/${totalPages})`}
                      </>
                    )}
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Lead time:{" "}
                  <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold text-foreground">
                    {leadTime} days
                  </span>
                </span>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <Filters
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  productTypeFilter={productTypeFilter}
                  onProductTypeFilterChange={setProductTypeFilter}
                  demandTypeFilter={demandTypeFilter}
                  onDemandTypeFilterChange={setDemandTypeFilter}
                />
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={loading}
                    className="gap-1.5"
                    title="Fetch fresh data from Unleashed (clears session cache)"
                  >
                    <RefreshCw
                      className={`size-3.5 ${loading ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportBomParentsToCSV(bomParentExportRows)}
                  >
                    Export BOM Parents
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(filteredData)}
                    className="gap-1.5"
                  >
                    <Download className="size-3.5" />
                    Export CSV
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center justify-center gap-4 min-h-[320px]">
                  <Spinner className="size-10 text-primary" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Loading stock data...
                  </p>
                </div>
              ) : error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              ) : (
                <>
                  {enriching && (
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2">
                      <Spinner className="size-3.5 text-primary" />
                      <span className="text-xs text-muted-foreground">
                        Updating demand and supply data...
                      </span>
                    </div>
                  )}
                  {dashboardWarnings.length > 0 && !enriching && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Some data sources were temporarily unreachable. Core stock data is current.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-6">
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
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showOnlyWithCwStock}
                          disabled={threePlUnavailable}
                          onChange={(e) =>
                            setShowOnlyWithCwStock(e.target.checked)
                          }
                          className="rounded border-border bg-secondary"
                        />
                        <span className="text-xs text-muted-foreground">
                          Show only items with CW stock{threePlUnavailable ? " (unavailable)" : ""}
                        </span>
                      </label>
                    </div>
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
                    filterEmptyHint={
                      filteredData.length === 0 && items.length > 0
                        ? 'Your dataset has loaded, but nothing passes the filters above. Try "All Statuses" or adjust Product Type / Demand / stock options.'
                        : undefined
                    }
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
        leadTime={leadTime}
        bomVisibilityMap={bomVisibility}
      />
    </div>
  )
}
