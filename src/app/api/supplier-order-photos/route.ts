import { createClient } from '@/lib/supabase/server';
import { privateOrderPhotoPath } from '@/lib/supplier-order-photos';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const path = privateOrderPhotoPath(`/api/supplier-order-photos${new URL(request.url).search}`);
    if (!path) return new Response('Photo invalide.', { status: 400 });
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Connexion requise.', { status: 401 });
    const { data: profile } = await supabase.from('users').select('role, is_active').eq('id', user.id).single<{ role: string; is_active: boolean }>();
    if (!profile?.is_active || (path.split('/')[0] !== user.id && !['admin', 'secretary'].includes(profile.role))) {
      return new Response('Accès refusé.', { status: 403 });
    }
    // Un préfixe propriétaire valide ne prouve pas l'attachement à un BC accessible.
    // La requête est filtrée par RLS (technicien : ses BC ; staff : tous).
    const { data: orders, error: orderError } = await supabase.from('supplier_orders')
      .select('photos').eq('technician_id', path.split('/')[0])
      .eq('intervention_id', path.split('/')[2]).returns<{ photos: unknown }[]>();
    const attached = orders?.some((order) => Array.isArray(order.photos) && order.photos.some((photo) => {
      const url = typeof photo === 'string' ? photo : (photo as { url?: string })?.url;
      return typeof url === 'string' && privateOrderPhotoPath(url) === path;
    }));
    if (orderError || !attached) return new Response('Photo inaccessible.', { status: 404 });
    const { data, error } = await supabase.storage.from('photos').download(path);
    if (error || !data) return new Response('Photo inaccessible.', { status: 404 });
    return new Response(data, { headers: { 'Content-Type': data.type || 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Lecture impossible.', { status: 503 }); }
}
