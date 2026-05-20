'use client'

import dynamic from 'next/dynamic'

const MobileWorld = dynamic(() => import('./MobileWorld'), { ssr: false })

export default function MobileWorldPage() {
  return <MobileWorld />
}