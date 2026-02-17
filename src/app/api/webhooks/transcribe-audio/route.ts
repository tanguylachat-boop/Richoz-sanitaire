import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Schema for audio transcription request
const TranscribePayloadSchema = z.object({
  audio_url: z.string().url(),
  report_id: z.string().uuid().optional(),
  intervention_id: z.string().uuid().optional(),
});

/**
 * POST /api/webhooks/transcribe-audio
 * Triggers audio transcription via n8n workflow
 * This is a pass-through endpoint that n8n can call back after transcription
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
    const payload = TranscribePayloadSchema.parse(body);

    // If this is a callback with transcription result
    if (body.transcription && payload.report_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;

      const { error } = await supabase
        .from('reports')
        .update({
          vocal_transcription: body.transcription,
        })
        .eq('id', payload.report_id);

      if (error) throw error;

      return NextResponse.json({
        success: true,
        report_id: payload.report_id,
        transcription_saved: true,
      });
    }

    // Otherwise, trigger n8n workflow for transcription
    const n8nWebhookUrl = process.env.N8N_TRANSCRIBE_WEBHOOK_URL;

    if (!n8nWebhookUrl) {
      return NextResponse.json(
        { error: 'Webhook de transcription non configuré' },
        { status: 500 }
      );
    }

    // Call n8n to handle the actual transcription
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: payload.audio_url,
        report_id: payload.report_id,
        intervention_id: payload.intervention_id,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/transcribe-audio`,
      }),
    });

    if (!n8nResponse.ok) {
      throw new Error('Erreur lors de l\'appel au service de transcription');
    }

    return NextResponse.json({
      success: true,
      message: 'Transcription en cours',
      audio_url: payload.audio_url,
    });
  } catch (error) {
    console.error('Transcribe error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors de la transcription' },
      { status: 500 }
    );
  }
}
