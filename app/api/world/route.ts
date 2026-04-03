import { store } from '@/lib/store'

export async function GET() {
  return Response.json({
    worldStates: store.worldStates,
    logs: store.logs,
  })
}
