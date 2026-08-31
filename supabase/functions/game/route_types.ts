// =============================================================================
// Shared shape every extracted route-group module receives from the main
// game/index.ts dispatcher. Keeping this in its own file (rather than each
// route module importing straight from index.ts) avoids a circular import:
// index.ts imports the route-group handlers, so the handlers can't also
// import from index.ts.
// =============================================================================
import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { JWTPayload } from '../_shared/auth.ts'

export interface RouteContext {
  req: Request
  url: URL
  method: string
  path: string
  authUser: JWTPayload | null
  supabase: SupabaseClient
}

/** A route-group handler tries each of its own routes against the context;
 *  returns a Response if one matched, or null to let the next group try. */
export type RouteHandler = (ctx: RouteContext) => Promise<Response | null>
