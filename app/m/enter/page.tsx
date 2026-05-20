'use client'

import dynamic from 'next/dynamic'

const MobileEnterClient = dynamic(() => import('./MobileEnterClient'), { ssr: false })

export default function MobileEnterPage() {
  return <MobileEnterClient />
}