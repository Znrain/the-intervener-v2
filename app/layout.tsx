import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '介入者 / The Intervener',
  description: '一个由物理积木驱动、能够自主演化的AI生成世界系统',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full" suppressHydrationWarning>{children}</body>
    </html>
  )
}
