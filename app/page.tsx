"use client"

import { useState, useMemo, useEffect } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { TopNav } from "@/components/dashboard/top-nav"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { Filters } from "@/components/dashboard/filters"
import { RiskTable } from "@/components/dashboard/risk-table"
import { DetailPanel } from "@/components/dashboard/detail-panel"
import type { SkuItem } from "@/lib/placeholder-data"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { loadShopifySkus } from "@/lib/loadShopifySkus"
import {
  buildUnifiedDataset,
  buildBomVisibilityMap,
  classifySkus,
  type BOMItem,
  type InternalStockItem,
  type DemandSource,
} from "@/lib/inventory-risk"
import type { DemandDayPoint } from "@/lib/bom-demand"

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
  const escape = (v: string | number | boolean | undefined) =>
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
  a.download = `nab_inventory_risk_snapshot_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

interface BomParentExportRow {
  sku: string
  productName: string
  componentCount: number
  bomLineCount: number
}

function exportBomParentsToCSV(rows: BomParentExportRow[]) {
  const headers = ["SKU", "Product Name", "Component Count", "BOM Line Count"]
  const escape = (v: string | number | boolean | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`

  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      [row.sku, row.productName, row.componentCount, row.bomLineCount]
        .map(escape)
        .join(",")
    ),
  ].join("\n")

  const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `nab_bom_parents_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function DashboardPage() {
  const [leadTime, setLeadTime] = useState(3)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [productTypeFilter, setProductTypeFilter] = useState("all")
  const [demandTypeFilter, setDemandTypeFilter] = useState("all")
  const [selectedSku, setSelectedSku] = useState<SkuItem | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const [internalStockItems, setInternalStockItems] = useState<
    InternalStockItem[]
  >([])
  const [salesBySku, setSalesBySku] = useState<DemandSource>({})
  const [assemblyByComponentSku, setAssemblyByComponentSku] =
    useState<DemandSource>({})
  const [bomData, setBomData] = useState<BOMItem[]>([])
  const [shopifySkuSet, setShopifySkuSet] = useState<Set<string>>(new Set())

  // Phase 1 = fast data (stock + sales + SKUs), Phase 2 = slow data (assemblies + BOMs)
  const [phase1Loading, setPhase1Loading] = useState(true)
  const [phase2Loading, setPhase2Loading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [showZeroStock, setShowZeroStock] = useState(false)
  const [showOnlyWithCwStock, setShowOnlyWithCwStock] = useState(false)
  const PAGE_SIZE = 50

  useEffect(() => {
    setPhase1Loading(true)
    setPhase2Loading(true)
    setError(null)

    // #region agent log
    const _fetchStart = Date.now();
    fetch('http://127.0.0.1:7912/ingest/55bfa669-1c28-47a7-822a-5e1e23521f36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1840fa'},body:JSON.stringify({sessionId:'1840fa',location:'page.tsx:useEffect',message:'Starting progressive fetch',data:{},timestamp:_fetchStart,hypothesisId:'H-ALL'})}).catch(()=>{});
    // #endregion

    // --- PHASE 1: Fast data (stock + sales + Shopify SKUs) ---
    Promise.all([
      fetch("/api/unleashed/internal-stock").then((res) =>
        res.json().then((body) => ({ ok: res.ok, body }))
      ),
      fetch("/api/unleashed/sales-trend").then((res) =>
        res.json().then((body) => ({ ok: res.ok, body }))
      ),
      loadShopifySkus(),
    ])
      .then(([stockRes, salesRes, skuSet]) => {
        // #region agent log
        fetch('http://127.0.0.1:7912/ingest/55bfa669-1c28-47a7-822a-5e1e23521f36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1840fa'},body:JSON.stringify({sessionId:'1840fa',location:'page.tsx:phase1:done',message:'Phase 1 done',data:{durationMs:Date.now()-_fetchStart,stockOk:stockRes.ok,salesOk:salesRes.ok,skuSetSize:skuSet.size},timestamp:Date.now(),hypothesisId:'H-ALL'})}).catch(()=>{});
        // #endregion
        if (!stockRes.ok)
          throw new Error(
            stockRes.body?.detail || stockRes.body?.error || "Failed stock fetch"
          )
        if (!salesRes.ok)
          throw new Error(
            salesRes.body?.detail || salesRes.body?.error || "Failed sales fetch"
          )

        setInternalStockItems(
          Array.isArray(stockRes.body?.items) ? stockRes.body.items : []
        )
        setSalesBySku(salesRes.body?.bySku ?? {})
        setShopifySkuSet(skuSet)
        setPhase1Loading(false)
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load inventory data."
        setError(message)
        setPhase1Loading(false)
      })

    // --- PHASE 2: Slow data (assemblies + BOMs) -- fetched in parallel, non-blocking ---
    Promise.all([
      fetch("/api/unleashed/assembly-trend").then((res) =>
        res.json().then((body) => ({ ok: res.ok, body }))
      ),
      fetch("/api/unleashed/boms").then((res) =>
        res.json().then((body) => ({ ok: res.ok, body }))
      ),
    ])
      .then(([assemblyRes, bomRes]) => {
        // #region agent log
        fetch('http://127.0.0.1:7912/ingest/55bfa669-1c28-47a7-822a-5e1e23521f36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1840fa'},body:JSON.stringify({sessionId:'1840fa',location:'page.tsx:phase2:done',message:'Phase 2 done',data:{durationMs:Date.now()-_fetchStart,assemblyOk:assemblyRes.ok,bomCount:bomRes.body?.Items?.length??0,componentCount:assemblyRes.body?.byComponentSku?Object.keys(assemblyRes.body.byComponentSku).length:0},timestamp:Date.now(),hypothesisId:'H-ALL'})}).catch(()=>{});
        // #endregion
        if (assemblyRes.ok) {
          setAssemblyByComponentSku(assemblyRes.body?.byComponentSku ?? {})
        }
        if (bomRes.ok) {
          const items = Array.isArray(bomRes.body?.Items)
            ? bomRes.body.Items
            : []
          setBomData(items)
        }
      })
      .catch((err) => {
        console.warn("[phase2] Enhancement fetch failed, table shows sales-only demand:", err)
      })
      .finally(() => setPhase2Loading(false))
  }, [])

  const loading = phase1Loading || phase2Loading

  const { items: tableData, demandTrendBySku } = useMemo(() => {
    if (phase1Loading || phase2Loading || error) return { items: [], demandTrendBySku: {} }
    return buildUnifiedDataset({
      internalStockItems,
      salesBySku,
      assemblyByComponentSku,
      bomData,
      shopifySkuSet,
      leadTime,
    })
  }, [
    internalStockItems,
    salesBySku,
    assemblyByComponentSku,
    bomData,
    shopifySkuSet,
    leadTime,
    phase1Loading,
    phase2Loading,
    error,
  ])

  const bomVisibilityMap = useMemo(
    () => buildBomVisibilityMap(bomData, shopifySkuSet),
    [bomData, shopifySkuSet]
  )

  const bomParentExportRows = useMemo(() => {
    const { bomParentSkus, componentMetaMap, filteredBoms } = classifySkus(
      bomData,
      shopifySkuSet
    )

    const productNameByParent = new Map<string, string>()
    const bomLineCountByParent = new Map<string, number>()
    for (const bom of filteredBoms) {
      const parentSku = bom.Product?.ProductCode?.trim()
      if (!parentSku) continue
      productNameByParent.set(
        parentSku,
        bom.Product?.ProductDescription?.trim() || parentSku
      )
      bomLineCountByParent.set(
        parentSku,
        (bom.BillOfMaterialsLines ?? []).length
      )
    }

    const componentCountByParent = new Map<string, number>()
    for (const component of componentMetaMap.values()) {
      for (const parentSku of component.parentSkus) {
        componentCountByParent.set(
          parentSku,
          (componentCountByParent.get(parentSku) ?? 0) + 1
        )
      }
    }

    return Array.from(bomParentSkus)
      .sort((a, b) => a.localeCompare(b))
      .map((sku) => ({
        sku,
        productName: productNameByParent.get(sku) ?? sku,
        componentCount: componentCountByParent.get(sku) ?? 0,
        bomLineCount: bomLineCountByParent.get(sku) ?? 0,
      }))
  }, [bomData, shopifySkuSet])

  const demandTrendOverrideBySku = useMemo(() => {
    const map: Record<
      string,
      { last90Days: DemandDayPoint[]; total90Days: number }
    > = {}
    for (const [sku, entry] of Object.entries(demandTrendBySku)) {
      map[sku] = { last90Days: entry.last90Days, total90Days: entry.total90Days }
    }
    return map
  }, [demandTrendBySku])

  const filteredData = useMemo(() => {
    return tableData.filter((item) => {
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
      const matchesCwStock = !showOnlyWithCwStock || item.thirdPlStock > 0

      return (
        matchesSearch &&
        matchesStatus &&
        matchesProductType &&
        matchesDemandType &&
        matchesStock &&
        matchesCwStock
      )
    })
  }, [
    tableData,
    searchQuery,
    statusFilter,
    productTypeFilter,
    demandTypeFilter,
    showZeroStock,
    showOnlyWithCwStock,
  ])

  useEffect(() => {
    console.log("[SKU Count Debug]", {
      totalSkusCard: tableData.length,
      totalRowsTable: filteredData.length,
      showZeroStockEnabled: showZeroStock,
      filteredDatasetLength: filteredData.length,
    })
  }, [tableData.length, filteredData.length, showZeroStock])

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

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        <TopNav
          leadTime={leadTime}
          onLeadTimeChange={setLeadTime}
        />

        <main className="flex-1 p-5 lg:p-6 overflow-y-auto">
          <div className="flex flex-col gap-5 max-w-[1440px]">
            <KpiCards data={filteredData} totalSkuCount={tableData.length} />
            <p className="text-xs text-muted-foreground -mt-1">
              {shopifySkuSet.size.toLocaleString()} total Shopify SKUs ·{" "}
              {tableData.length.toLocaleString()} analyzed
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Replenishment Risk Table
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {loading ? (
                      "Loading inventory risk data..."
                    ) : (
                      <>
                        Click any row to view detailed analytics. Showing{" "}
                        <span className="font-semibold text-foreground">
                          {filteredData.length > 0
                            ? `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filteredData.length)}`
                            : "0"}
                        </span>{" "}
                        of{" "}
                        <span className="font-semibold text-foreground">
                          {filteredData.length}
                        </span>{" "}
                        {totalPages > 1 && `(page ${page}/${totalPages})`}
                        {phase2Loading && (
                          <span className="ml-2 text-primary/70">
                            · Enhancing with assembly + BOM data...
                          </span>
                        )}
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
                    Loading inventory risk data...
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    Fetching stock and sales data
                  </p>
                </div>
              ) : error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              ) : (
                <>
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
                          onChange={(e) =>
                            setShowOnlyWithCwStock(e.target.checked)
                          }
                          className="rounded border-border bg-secondary"
                        />
                        <span className="text-xs text-muted-foreground">
                          Show only items with CW stock
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
                  <RiskTable data={paginatedData} onRowClick={handleRowClick} />
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
        demandTrendOverrideBySku={demandTrendOverrideBySku}
        demandTrendTitle="90-Day Demand Trend (SS + ASM)"
        bomVisibilityMap={bomVisibilityMap}
      />
    </div>
  )
}
