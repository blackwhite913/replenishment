"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Unexpected application error
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Please retry. If this keeps happening, return to the dashboard.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button type="button" onClick={() => reset()}>
                Retry
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
