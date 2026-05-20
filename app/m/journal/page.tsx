'use client'

import dynamic from 'next/dynamic'

const MobileJournal = dynamic(() => import('./MobileJournal'), { ssr: false })

export default function MobileJournalPage() {
  return <MobileJournal />
}