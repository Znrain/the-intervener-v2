'use client'

import dynamic from 'next/dynamic'

const IntervenorApp = dynamic(() => import('@/app/components/IntervenorApp'), {
  ssr: false,
})

export default function Home() {
  return <IntervenorApp />
}
