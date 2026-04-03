import z from 'zod'
import { Action, BodyExtracter, type Middleware } from '@/romi'
import { Left, Right } from '@/romi/utils/adt/either'
import type { AppState } from './common'

export const checkLoginMiddleware: Middleware<{ userId: string }, { error: string }> = async (_data, _state, _req) =>
  /*   req.headers.authorization === 'valid-token' ? Right({ userId: '123' }) : Left({ error: 'Invalid token' }) */ Right(
    { userId: '123' }
  )

export const getUserHandler = Action.empty<AppState>()
  .bind(checkLoginMiddleware)
  .use([new BodyExtracter(z.object({ int: z.number() }))] as const)
  .bind(async ([body]) => (body.int === 0 ? Left({ error: 'a cannot be zero' }) : Right({ b: 2 / (body.int + 1) })))
  .bind(async ([body], state, _req) => {
    state.logger.info(`User ${state.userId} is making a request with data: ${body.int}`)
    return Right({ a: 1 + body.int })
  })
