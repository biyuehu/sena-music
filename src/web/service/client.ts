import { createClient } from '@/romi/client'
import type { AppRouter } from '../../server/app'
import { Storage } from '../utils/storage'

export const httpClient = createClient<AppRouter>({
  baseUrl: () => Storage.get<string>('api-base-url').unwrapOrElse(() => '')
})
