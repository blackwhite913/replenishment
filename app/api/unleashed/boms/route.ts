import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getAllBoms } from "@/lib/unleashed-boms"

export const maxDuration = 30

export async function GET(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const forceRefresh = searchParams.get("refresh") === "1"

  try {
    const result = await getAllBoms(forceRefresh)
    return NextResponse.json({
      Items: result.items,
      allPages: true,
      lastUpdated: result.lastUpdated,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Unleashed BOM fetch failed", detail },
      { status: 502 }
    )
  }
}
