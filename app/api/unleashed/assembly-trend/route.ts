import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getAssemblyTrend } from "@/lib/unleashed-assemblies"

export const maxDuration = 30

export async function GET(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const forceRefresh = searchParams.get("refresh") === "1"

  try {
    const result = await getAssemblyTrend(forceRefresh)
    return NextResponse.json({
      byComponentSku: result.byComponentSku ?? {},
      lastUpdated: result.lastUpdated,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      {
        error: "Assembly trend fetch failed",
        detail,
      },
      { status: 502 }
    )
  }
}
