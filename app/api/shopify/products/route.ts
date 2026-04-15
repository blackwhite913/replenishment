import { NextResponse } from "next/server"

const DEFAULT_SHOPIFY_API_VERSION = "2026-04"
const FETCH_TIMEOUT_MS = 15_000

interface ShopifyVariant {
  sku?: string | null
}

interface ShopifyProduct {
  id?: number | string
  title?: string | null
  handle?: string | null
  status?: string | null
  vendor?: string | null
  product_type?: string | null
  variants?: ShopifyVariant[] | null
}

interface ShopifyProductsResponse {
  products?: ShopifyProduct[] | null
}

function normalizeStoreDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")
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
  console.log("Shopify products fetch started")

  try {
    const url = new URL(
      `https://${storeDomain}/admin/api/${apiVersion}/products.json`
    )
    url.searchParams.set("limit", "250")

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    if (!response.ok) {
      const detailText = await response.text().catch(() => "")
      throw new Error(
        `Shopify request failed with status ${response.status}${detailText ? `: ${detailText.slice(0, 500)}` : ""}`
      )
    }

    const payload = (await response.json()) as ShopifyProductsResponse
    const products = Array.isArray(payload.products) ? payload.products : []

    const cleanedProducts = products.map((product) => {
      const variants = Array.isArray(product.variants) ? product.variants : []
      const skuSet = new Set<string>()
      for (const variant of variants) {
        const sku = variant?.sku?.trim()
        if (sku) skuSet.add(sku)
      }

      return {
        id: product.id ?? "",
        title: product.title?.trim() || "Untitled product",
        handle: product.handle?.trim() || "",
        status: product.status?.trim() || "unknown",
        vendor: product.vendor?.trim() || "",
        productType: product.product_type?.trim() || "",
        variantCount: variants.length,
        skuCount: skuSet.size,
      }
    })

    const duration = Date.now() - startedAt

    console.log("Shopify products fetch completed")
    console.log(
      `[shopify-products] durationMs=${duration} totalProducts=${cleanedProducts.length} apiVersion=${apiVersion}`
    )

    return NextResponse.json({
      success: true,
      data: {
        products: cleanedProducts,
      },
      meta: {
        duration,
        totalProducts: cleanedProducts.length,
        apiVersion,
      },
    })
  } catch (error) {
    const duration = Date.now() - startedAt
    const details = error instanceof Error ? error.message : "Unknown error"

    console.log("Shopify products fetch completed")
    console.log(`[shopify-products] durationMs=${duration} error=${details}`)

    return NextResponse.json(
      {
        error: true,
        message: "Failed to fetch from Shopify",
        details,
      },
      { status: 502 }
    )
  }
}
