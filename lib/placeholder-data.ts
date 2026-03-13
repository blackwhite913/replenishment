export type SkuStatus = "healthy" | "monitoring" | "oosRisk"

export interface SkuItem {
  sku: string
  productName: string
  shopStock: number
  dailySales: number
  daysCover: number
  reorderPoint: number
  thirdPlStock: number
  status: SkuStatus
}

export interface SalesTrendPoint {
  date: string
  sales: number
}

export interface StockLevelPoint {
  date: string
  shop: number
  thirdPl: number
}

export interface TransferRecord {
  date: string
  qty: number
  from: string
  to: string
}

export const skuData: SkuItem[] = [
  {
    sku: "SKU-1001",
    productName: "Premium Wireless Headphones",
    shopStock: 12,
    dailySales: 8,
    daysCover: 1.5,
    reorderPoint: 24,
    thirdPlStock: 340,
    status: "oosRisk",
  },
  {
    sku: "SKU-1002",
    productName: "USB-C Charging Cable 2m",
    shopStock: 45,
    dailySales: 15,
    daysCover: 3.0,
    reorderPoint: 45,
    thirdPlStock: 820,
    status: "monitoring",
  },
  {
    sku: "SKU-1003",
    productName: "Ergonomic Mouse Pad XL",
    shopStock: 120,
    dailySales: 6,
    daysCover: 20.0,
    reorderPoint: 18,
    thirdPlStock: 450,
    status: "healthy",
  },
  {
    sku: "SKU-1004",
    productName: "Bluetooth Keyboard Compact",
    shopStock: 8,
    dailySales: 5,
    daysCover: 1.6,
    reorderPoint: 15,
    thirdPlStock: 0,
    status: "oosRisk",
  },
  {
    sku: "SKU-1005",
    productName: "Monitor Stand Adjustable",
    shopStock: 32,
    dailySales: 4,
    daysCover: 8.0,
    reorderPoint: 12,
    thirdPlStock: 200,
    status: "healthy",
  },
  {
    sku: "SKU-1006",
    productName: "Webcam 1080p HD",
    shopStock: 18,
    dailySales: 7,
    daysCover: 2.6,
    reorderPoint: 21,
    thirdPlStock: 155,
    status: "monitoring",
  },
  {
    sku: "SKU-1007",
    productName: "Laptop Sleeve 15 inch",
    shopStock: 5,
    dailySales: 10,
    daysCover: 0.5,
    reorderPoint: 30,
    thirdPlStock: 600,
    status: "oosRisk",
  },
  {
    sku: "SKU-1008",
    productName: "Desk Lamp LED Dimmable",
    shopStock: 65,
    dailySales: 3,
    daysCover: 21.7,
    reorderPoint: 9,
    thirdPlStock: 180,
    status: "healthy",
  },
  {
    sku: "SKU-1009",
    productName: "HDMI Cable 3m Premium",
    shopStock: 22,
    dailySales: 9,
    daysCover: 2.4,
    reorderPoint: 27,
    thirdPlStock: 410,
    status: "monitoring",
  },
  {
    sku: "SKU-1010",
    productName: "Portable SSD 1TB",
    shopStock: 3,
    dailySales: 6,
    daysCover: 0.5,
    reorderPoint: 18,
    thirdPlStock: 95,
    status: "oosRisk",
  },
  {
    sku: "SKU-1011",
    productName: "Noise Cancelling Earbuds",
    shopStock: 40,
    dailySales: 5,
    daysCover: 8.0,
    reorderPoint: 15,
    thirdPlStock: 320,
    status: "healthy",
  },
  {
    sku: "SKU-1012",
    productName: "Wireless Charging Pad",
    shopStock: 14,
    dailySales: 6,
    daysCover: 2.3,
    reorderPoint: 18,
    thirdPlStock: 275,
    status: "monitoring",
  },
]

export function generateSalesTrend(): SalesTrendPoint[] {
  const data: SalesTrendPoint[] = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sales: Math.floor(Math.random() * 30) + 5,
    })
  }
  return data
}

export function generateStockLevels(): StockLevelPoint[] {
  const data: StockLevelPoint[] = []
  const now = new Date()
  let shopStock = 80
  let thirdPlStock = 400
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    shopStock = Math.max(5, shopStock + Math.floor(Math.random() * 20) - 12)
    thirdPlStock = Math.max(50, thirdPlStock + Math.floor(Math.random() * 30) - 15)
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      shop: shopStock,
      thirdPl: thirdPlStock,
    })
  }
  return data
}

export const transferHistory: TransferRecord[] = [
  { date: "Feb 20, 2026", qty: 50, from: "3PL (CW Logistics)", to: "Shop" },
  { date: "Feb 15, 2026", qty: 30, from: "3PL (CW Logistics)", to: "Shop" },
  { date: "Feb 10, 2026", qty: 80, from: "3PL (CW Logistics)", to: "Shop" },
  { date: "Feb 05, 2026", qty: 25, from: "3PL (CW Logistics)", to: "Shop" },
  { date: "Jan 28, 2026", qty: 60, from: "3PL (CW Logistics)", to: "Shop" },
]
