import { createClient } from '@/romi/client'
import type { AppRouter } from '../server/app'

export const httpClient = createClient<AppRouter>()
