import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Schema for report submission payload
const ReportPayloadSchema = z.object({
  intervention_id: z.string().uuid(),
  technician_id: z.string().uuid(),
  text_content: z.string().optional(),
  vocal_url: z.string().url().optional(),
  vocal_transcription: z.string().optional(),
  photos: z
    .array(
      z.object({
        url: z.string().url(),
        caption: z.string().optional(),
      })
    )
    .optional(),
  checklist: z
    .array(
      z.object({
        item: z.string(),
        done: z.boolean(),
      })
    )
    .optional(),
  is_billable: z.boolean().default(true),
  billable_reason: z.string().optional(),
  work_duration_minutes: z.number().optional(),
  materials_used: z
    .array(
      z.object({
        product_id: z.string().uuid().optional(),
        name: z.string(),
        quantity: z.number(),
        unit_price: z.number(),
      })
    )
    .optional(),
});

/**
 * POST /api/webhooks/report-submit
 * Receives technician field reports from mobile app or n8n
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
    const payload = ReportPayloadSchema.parse(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;

    // Verify intervention exists and belongs to technician
    const { data: interventionData, error: interventionError } = await supabase
      .from('interventions')
      .select('id, technician_id, status')
      .eq('id', payload.intervention_id)
      .single();

    const intervention = interventionData as { id: string; technician_id: string; status: string } | null;

    if (interventionError || !intervention) {
      return NextResponse.json(
        { error: 'Intervention non trouvée' },
        { status: 404 }
      );
    }

    // Check if report already exists for this intervention
    const { data: existingReportData } = await supabase
      .from('reports')
      .select('id')
      .eq('intervention_id', payload.intervention_id)
      .single();

    const existingReport = existingReportData as { id: string } | null;

    let report: { id: string; is_billable: boolean } | null = null;

    if (existingReport) {
      // Update existing report
      const { data, error } = await supabase
        .from('reports')
        .update({
          text_content: payload.text_content || null,
          vocal_url: payload.vocal_url || null,
          vocal_transcription: payload.vocal_transcription || null,
          photos: payload.photos || [],
          checklist: payload.checklist || [],
          is_billable: payload.is_billable,
          billable_reason: payload.billable_reason || null,
          work_duration_minutes: payload.work_duration_minutes || null,
          materials_used: payload.materials_used || [],
          status: 'submitted',
        })
        .eq('id', existingReport.id)
        .select()
        .single();

      if (error) throw error;
      report = data as { id: string; is_billable: boolean };
    } else {
      // Create new report
      const { data, error } = await supabase
        .from('reports')
        .insert({
          intervention_id: payload.intervention_id,
          technician_id: payload.technician_id,
          text_content: payload.text_content || null,
          vocal_url: payload.vocal_url || null,
          vocal_transcription: payload.vocal_transcription || null,
          photos: payload.photos || [],
          checklist: payload.checklist || [],
          is_billable: payload.is_billable,
          billable_reason: payload.billable_reason || null,
          work_duration_minutes: payload.work_duration_minutes || null,
          materials_used: payload.materials_used || [],
          status: 'submitted',
        })
        .select()
        .single();

      if (error) throw error;
      report = data as { id: string; is_billable: boolean };
    }

    // Update intervention status to completed
    const { error: updateError } = await supabase
      .from('interventions')
      .update({
        status: 'termine',
        date_completed: new Date().toISOString(),
      })
      .eq('id', payload.intervention_id);

    if (updateError) {
      console.error('Intervention update error:', updateError);
    }

    return NextResponse.json({
      success: true,
      report_id: report?.id,
      is_billable: report?.is_billable,
      intervention_status: 'termine',
    });
  } catch (error) {
    console.error('Report submit error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors de la soumission du rapport' },
      { status: 500 }
    );
  }
}
