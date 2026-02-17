import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Schema for email ingestion payload from n8n
const EmailPayloadSchema = z.object({
  gmail_message_id: z.string(),
  received_at: z.string(),
  from_email: z.string().email(),
  from_name: z.string().optional(),
  subject: z.string().optional(),
  body_text: z.string().optional(),
  body_html: z.string().optional(),
  extracted_data: z
    .object({
      client_name: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      issue_description: z.string().optional(),
      urgency: z.string().optional(),
      apartment: z.string().optional(),
    })
    .optional(),
  regie_keyword: z.string().optional(),
  confidence_score: z.number().min(0).max(1).optional(),
  // Numéro de bon de travail extrait de l'email par n8n
  work_order_number: z.string().optional(),
});

/**
 * POST /api/webhooks/email-ingestion
 * Receives parsed emails from n8n Gmail workflow
 * Inserts into email_inbox table and optionally creates intervention
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
    const payload = EmailPayloadSchema.parse(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;

    // Check if email already processed
    const { data: existingEmailData } = await supabase
      .from('email_inbox')
      .select('id')
      .eq('gmail_message_id', payload.gmail_message_id)
      .single();

    const existingEmail = existingEmailData as { id: string } | null;

    if (existingEmail) {
      return NextResponse.json({
        success: true,
        message: 'Email déjà traité',
        email_id: existingEmail.id,
        duplicate: true,
      });
    }

    // Find matching regie by keyword
    let regieId: string | null = null;
    if (payload.regie_keyword) {
      const { data: regieData } = await supabase
        .from('regies')
        .select('id')
        .ilike('keyword', payload.regie_keyword)
        .single();

      const regie = regieData as { id: string } | null;
      if (regie) {
        regieId = regie.id;
      }
    }

    // Insert email into inbox
    const { data: emailData, error: emailError } = await supabase
      .from('email_inbox')
      .insert({
        gmail_message_id: payload.gmail_message_id,
        received_at: payload.received_at,
        from_email: payload.from_email,
        from_name: payload.from_name || null,
        subject: payload.subject || null,
        body_text: payload.body_text || null,
        body_html: payload.body_html || null,
        extracted_data: payload.extracted_data || {},
        regie_id: regieId,
        confidence_score: payload.confidence_score || null,
        work_order_number: payload.work_order_number || null,
        status: 'new',
      })
      .select()
      .single();

    const email = emailData as { id: string } | null;

    if (emailError) {
      console.error('Email insert error:', emailError);
      throw emailError;
    }

    return NextResponse.json({
      success: true,
      email_id: email?.id,
      regie_matched: !!regieId,
      regie_id: regieId,
    });
  } catch (error) {
    console.error('Email ingestion error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors du traitement de l\'email' },
      { status: 500 }
    );
  }
}
