// @supabase/ssr 0.1 predates the SDK's third generic changing from Schema to
// SchemaName. Its runtime already delegates to the installed createClient.
// Describe that return type accurately; keep its cookie API unchanged.
import '@supabase/ssr';
import type { CookieMethods, CookieOptionsWithName } from '@supabase/ssr';
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';

declare module '@supabase/ssr' {
  export function createBrowserClient<Database>(
    supabaseUrl: string,
    supabaseKey: string,
    options?: SupabaseClientOptions<'public'> & {
      cookies: CookieMethods;
      cookieOptions?: CookieOptionsWithName;
      isSingleton?: boolean;
    }
  ): SupabaseClient<Database>;
  export function createServerClient<Database>(
    supabaseUrl: string,
    supabaseKey: string,
    options: SupabaseClientOptions<'public'> & {
      cookies: CookieMethods;
      cookieOptions?: CookieOptionsWithName;
    }
  ): SupabaseClient<Database>;
}
