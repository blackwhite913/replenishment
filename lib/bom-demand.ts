export interface DemandDayPoint {
  date: string
  units: number
}

export function combineTrends(
  ssTrend: DemandDayPoint[] = [],
  asmTrend: DemandDayPoint[] = []
): DemandDayPoint[] {
  const byDate = new Map<string, number>()

  for (const point of ssTrend) {
    byDate.set(point.date, (byDate.get(point.date) ?? 0) + (point.units ?? 0))
  }
  for (const point of asmTrend) {
    byDate.set(point.date, (byDate.get(point.date) ?? 0) + (point.units ?? 0))
  }

  return Array.from(byDate.entries())
    .map(([date, units]) => ({ date, units }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
