import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { InterventionStatus } from '@/types/database';

// Schema for calendar sync payload from n8n
const CalendarEventSchema = z.object({
  event_id: z.string(),
  action: z.enum(['created', 'updated', 'deleted']),
  title: z.string(),
  description: z.string().optional(),
  start_datetime: z.string(),
  end_datetime: z.string(),
  location: z.string().optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
      })
    )
    .optional(),
  regie_keyword: z.string().optional(),
});

/**
 * POST /api/webhooks/calendar-sync
 * Syncs Google Calendar events with interventions
 */
export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret
    const authHeader = req.headers.get('authorization');
    const expectedSecret = `Bearer ${process.env.N8N_WEBHOOK_SECRET}`;

    if (!authHeader || authHeader !== expectedSecret) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const payload = CalendarEventSchema.parse(body);

    const supabase = createClient();

    // Handle deletion
    if (payload.action === 'deleted') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('interventions')
        .update({ status: 'annule' })
        .eq('google_calendar_event_id', payload.event_id);

      if (error) {
        console.error('Deletion error:', error);
        throw error;
      }

      return NextResponse.json({
        success: true,
        action: 'cancelled',
        event_id: payload.event_id,
      });
    }

    // Find technician from attendees (email matching company domain)
    let technicianId: string | null = null;
    if (payload.attendees) {
      // Look for technician email (customize domains as needed)
      const techEmail = payload.attendees.find(
        (a) =>
          a.email.includes('@richoz-sanitaire.ch') ||
          a.email.includes('@richoz.ch') ||
          a.email.includes('@lxstudio.ch')
      )?.email;

      if (techEmail) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: tech } = await (supabase as any)
          .from('users')
          .select('id')
          .eq('email', techEmail)
          .eq('role', 'technician')
          .single();

        if (tech) {
          technicianId = (tech as { id: string }).id;
        }
      }
    }

    // Find regie from keyword in title or explicit keyword
    let regieId: string | null = null;
    const keywordToSearch = payload.regie_keyword || extractKeywordFromTitle(payload.title);

    if (keywordToSearch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: regie } = await (supabase as any)
        .from('regies')
        .select('id')
        .ilike('keyword', keywordToSearch)
        .single();

      if (regie) {
        regieId = (regie as { id: string }).id;
      }
    }

    // Calculate duration
    const start = new Date(payload.start_datetime);
    const end = new Date(payload.end_datetime);
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

    // Upsert intervention
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: intervention, error } = await (supabase as any)
      .from('interventions')
      .upsert(
        {
          google_calendar_event_id: payload.event_id,
          title: cleanTitle(payload.title),
          description: payload.description || null,
          address: payload.location || '',
          date_planned: payload.start_datetime,
          estimated_duration_minutes: durationMinutes,
          technician_id: technicianId,
          regie_id: regieId,
          status: 'planifie',
          source_type: 'calendar',
        },
        {
          onConflict: 'google_calendar_event_id',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Intervention upsert error:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      intervention_id: (intervention as { id: string }).id,
      action: payload.action,
      technician_assigned: !!technicianId,
      regie_matched: !!regieId,
    });
  } catch (error) {
    console.error('Calendar sync error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors de la synchronisation calendrier' },
      { status: 500 }
    );
  }
}

/**
 * Extracts regie keyword from title format: [KEYWORD] Title
 */
function extractKeywordFromTitle(title: string): string | null {
  const match = title.match(/\[([A-Z]+)\]/);
  return match ? match[1] : null;
}

/**
 * Removes [KEYWORD] prefix from title
 */
function cleanTitle(title: string): string {
  return title.replace(/\[[A-Z]+\]\s*/, '').trim();
}
