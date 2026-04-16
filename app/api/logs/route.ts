'use server'

import { store } from '@/lib/store'

export async function GET() {
  return Response.json({ logs: store.logs })
}
