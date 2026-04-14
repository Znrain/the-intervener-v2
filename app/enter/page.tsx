'use client'

import dynamic from 'next/dynamic'

const EnterClient = dynamic(() => import('./EnterClient'), { ssr: false })

export default function EnterPage() {
  return <EnterClient />
}
