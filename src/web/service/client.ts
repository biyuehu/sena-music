import { createClient } from '@/romi/client'
import type { AppRouter } from '../../server/app'
import { Cache } from '../utils/cache'

export const httpClient = createClient<AppRouter>({
  baseUrl: Cache.get<string>('api-base-url').unwrapOrElse(() => '')
})
