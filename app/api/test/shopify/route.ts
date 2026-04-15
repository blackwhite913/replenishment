import { NextResponse } from "next/server"
import {
  normalizeStoreDomain,
  fetchAllShopifyProducts,
} from "@/lib/shopify-variant-skus"

const DEFAULT_SHOPIFY_API_VERSION = "2026-04"

interface RawVariant {
  id?: number | string
  title?: string | null
  sku?: string | null
  barcode?: string | null
  price?: string | null
  inventory_quantity?: number | null
  inventory_item_id?: number | string | null
  option1?: string | null
  option2?: string | null
  option3?: string | null
  [key: string]: unknown
}

interface RawProduct {
  id?: number | string
  title?: string | null
  handle?: string | null
  status?: string | null
  vendor?: string | null
  product_type?: string | null
  tags?: string | null
  created_at?: string | null
  updated_at?: string | null
  published_at?: string | null
  variants?: RawVariant[] | null
  [key: string]: unknown
}

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

export interface DebugProduct {
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

function extractDebugProduct(product: RawProduct): DebugProduct {
  const variants = Array.isArray(product.variants) ? product.variants : []
  return {
    id: product.id ?? "",
    title: product.title ?? "",
    handle: product.handle ?? "",
    status: product.status ?? "",
    vendor: product.vendor ?? "",
    product_type: product.product_type ?? "",
    tags: product.tags ?? "",
    created_at: product.created_at ?? "",
    updated_at: product.updated_at ?? "",
    published_at: product.published_at ?? null,
    variants: variants.map((v) => ({
      id: v.id ?? "",
      title: v.title ?? "",
      sku: v.sku ?? null,
      barcode: v.barcode ?? null,
      price: v.price ?? null,
      inventory_quantity: v.inventory_quantity ?? null,
      inventory_item_id: v.inventory_item_id ?? null,
      option1: v.option1 ?? null,
      option2: v.option2 ?? null,
      option3: v.option3 ?? null,
    })),
  }
}

function getErrorStatusCode(details: string): number {
  if (details.includes("(401)")) return 401
  if (details.includes("(404)")) return 404
  if (details.includes("Network failure")) return 502
  if (details.includes("timed out")) return 504
  return 502
}

export async function GET() {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
  const rawStoreDomain = process.env.SHOPIFY_STORE_DOMAIN
  const apiVersion =
    process.env.SHOPIFY_API_VERSION?.trim() || DEFAULT_SHOPIFY_API_VERSION

  if (!accessToken || !rawStoreDomain) {
    return NextResponse.json(
      {
        error: true,
        message: "Missing SHOPIFY_ACCESS_TOKEN or SHOPIFY_STORE_DOMAIN",
      },
      { status: 500 }
    )
  }

  const storeDomain = normalizeStoreDomain(rawStoreDomain)
  if (!storeDomain) {
    return NextResponse.json(
      {
        error: true,
        message: "Missing SHOPIFY_ACCESS_TOKEN or SHOPIFY_STORE_DOMAIN",
      },
      { status: 500 }
    )
  }

  const startedAt = Date.now()

  try {
    const url = new URL(
      `https://${storeDomain}/admin/api/${apiVersion}/products.json`
    )
    url.searchParams.set("limit", "250")

    const { products: rawProducts, pagesFetched } =
      await fetchAllShopifyProducts(url.toString(), accessToken)

    const debugProducts = (rawProducts as RawProduct[]).map(extractDebugProduct)
    const totalVariants = debugProducts.reduce(
      (sum, p) => sum + p.variants.length,
      0
    )

    const duration = Date.now() - startedAt

    return NextResponse.json({
      success: true,
      data: {
        products: debugProducts,
      },
      meta: {
        duration,
        totalProducts: debugProducts.length,
        totalVariants,
        pagesFetched,
        source: "shopify-rest",
      },
    })
  } catch (error) {
    const duration = Date.now() - startedAt
    const details = error instanceof Error ? error.message : "Unknown error"

    return NextResponse.json(
      { error: true, message: "Failed to fetch from Shopify", details },
      { status: getErrorStatusCode(details) }
    )
  }
}
