"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Info } from "lucide-react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useShopifyInventoryCache,
  type DebugVariant,
  type ShopifyProductRow,
} from "@/components/providers/shopify-inventory-cache-provider"

const ROWS_PER_PAGE = 50

interface FlatVariantRow extends DebugVariant {
  productTitle: string
  productId: number | string
}

function buildVariantRows(products: ShopifyProductRow[]): FlatVariantRow[] {
  return products.flatMap((p) =>
    p.variants.map((v) => ({
      ...v,
      productTitle: p.title,
      productId: p.id,
    }))
  )
}

export default function InventoryPage() {
  const { products, meta, isPending, error, load, refresh } =
    useShopifyInventoryCache()

  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [search])

  const allVariantRows = useMemo(() => buildVariantRows(products), [products])

  const usableSkuCount = useMemo(
    () => allVariantRows.filter((v) => v.sku && v.sku.trim() !== "").length,
    [allVariantRows]
  )

  const filteredVariants = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allVariantRows
    return allVariantRows.filter(
      (v) =>
        v.productTitle.toLowerCase().includes(q) ||
        (v.sku ?? "").toLowerCase().includes(q) ||
        (v.barcode ?? "").toLowerCase().includes(q) ||
        v.title.toLowerCase().includes(q)
    )
  }, [allVariantRows, search])

  const totalPages = Math.max(1, Math.ceil(filteredVariants.length / ROWS_PER_PAGE))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pagedItems = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE
    return filteredVariants.slice(start, start + ROWS_PER_PAGE)
  }, [filteredVariants, page])

  const totalVariantsDisplay = meta.totalVariants ?? allVariantRows.length

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 min-w-0 flex-col">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-6 py-3">
            <MobileNav />
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Back
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Inventory
              </h1>
              <p className="text-xs text-muted-foreground">
                Product catalogue and variant inventory
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 lg:p-6">
          <div className="flex max-w-[1440px] flex-col gap-5">
            {isPending && (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-8">
                <Spinner className="size-8 text-primary/70" />
                <p className="text-sm text-muted-foreground">
                  Loading inventory catalogue…
                </p>
              </div>
            )}

            {error && !isPending && (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => refresh()}
                >
                  Retry
                </Button>
              </div>
            )}

            {!isPending && !error && (
              <div className="flex flex-col gap-4">
                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Total Products
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                      {(meta.totalProducts ?? products.length).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Total Variants
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                      {totalVariantsDisplay.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                      Usable SKUs
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help text-muted-foreground/70 hover:text-foreground">
                            <Info className="size-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6} className="max-w-xs">
                          Variants that carry a valid SKU and can be matched against Unleashed for replenishment.
                        </TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                      {usableSkuCount.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Count explanation */}
                <p className="text-xs text-muted-foreground">
                  Inventory is organised by Shopify products and their variants. Replenishment matching uses usable variant SKUs, so SKU totals may differ from product or variant counts.
                </p>

                {/* Search */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex-1">
                    <label
                      htmlFor="inventory-search"
                      className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      Search products or variants
                    </label>
                    <input
                      id="inventory-search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search by product, variant, or SKU…"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-secondary/40">
                        <TableRow className="border-b border-border bg-secondary/40 hover:bg-secondary/40">
                          <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Product
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Variant
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            SKU
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Barcode
                          </TableHead>
                          <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Price
                          </TableHead>
                          <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Inventory
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(pagedItems as FlatVariantRow[]).map((variant) => (
                          <TableRow
                            key={`${String(variant.productId)}-${String(variant.id)}`}
                            className="border-b border-border/50 transition-colors hover:bg-secondary/30"
                          >
                            <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                              {variant.productTitle || "—"}
                            </TableCell>
                            <TableCell className="text-sm text-foreground">
                              {variant.title || "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-primary">
                              {variant.sku || (
                                <span className="text-muted-foreground/50 italic">
                                  no SKU
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {variant.barcode || "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-foreground">
                              {variant.price ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-foreground">
                              {variant.inventory_quantity ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {filteredVariants.length === 0 ? (
                    <p className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      No results match your search.
                    </p>
                  ) : (
                    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        Showing{" "}
                        <span className="tabular-nums">
                          {pagedItems.length.toLocaleString()}
                        </span>{" "}
                        of{" "}
                        <span className="tabular-nums">
                          {filteredVariants.length.toLocaleString()}
                        </span>{" "}
                        items
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPage((current) => Math.max(1, current - 1))
                          }
                          disabled={page <= 1}
                        >
                          Previous
                        </Button>
                        <span className="min-w-[90px] text-center text-xs text-muted-foreground">
                          Page {page} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPage((current) =>
                              Math.min(totalPages, current + 1)
                            )
                          }
                          disabled={page >= totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
