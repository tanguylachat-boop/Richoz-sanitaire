import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Schema for invoice validation payload
const InvoiceValidateSchema = z.object({
  report_id: z.string().uuid(),
  action: z.enum(['validate', 'reject']),
  validated_by: z.string().uuid(),
  line_items: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number(),
        unit_price: z.number(),
        total: z.number(),
      })
    )
    .optional(),
  rejection_reason: z.string().optional(),
  discount_amount: z.number().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/webhooks/invoice-validate
 * Validates a report and optionally creates an invoice
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
    const payload = InvoiceValidateSchema.parse(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;

    // Verify report exists
    const { data: reportData, error: reportError } = await supabase
      .from('reports')
      .select('*, intervention:interventions(*)')
      .eq('id', payload.report_id)
      .single();

    const report = reportData as { id: string; is_billable: boolean; intervention_id: string } | null;

    if (reportError || !report) {
      return NextResponse.json(
        { error: 'Rapport non trouvé' },
        { status: 404 }
      );
    }

    // Handle rejection
    if (payload.action === 'reject') {
      const { error } = await supabase
        .from('reports')
        .update({
          status: 'rejected',
          validated_at: new Date().toISOString(),
          validated_by: payload.validated_by,
        })
        .eq('id', payload.report_id);

      if (error) throw error;

      return NextResponse.json({
        success: true,
        action: 'rejected',
        report_id: payload.report_id,
        reason: payload.rejection_reason,
      });
    }

    // Validate report
    const { error: validateError } = await supabase
      .from('reports')
      .update({
        status: 'validated',
        validated_at: new Date().toISOString(),
        validated_by: payload.validated_by,
      })
      .eq('id', payload.report_id);

    if (validateError) throw validateError;

    // Check if report is billable and has line items
    if (!report.is_billable) {
      return NextResponse.json({
        success: true,
        action: 'validated',
        report_id: payload.report_id,
        invoice_created: false,
        reason: 'non_billable',
      });
    }

    // Create invoice if line items provided
    if (payload.line_items && payload.line_items.length > 0) {
      const VAT_RATE = 7.7;
      const subtotal = payload.line_items.reduce((sum, item) => sum + item.total, 0);
      const discountAmount = payload.discount_amount || 0;
      const taxableAmount = subtotal - discountAmount;
      const vatAmount = Math.round(taxableAmount * (VAT_RATE / 100) * 100) / 100;
      const total = Math.round((taxableAmount + vatAmount) * 100) / 100;

      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          report_id: payload.report_id,
          line_items: payload.line_items,
          subtotal,
          discount_amount: discountAmount,
          vat_rate: VAT_RATE,
          vat_amount: vatAmount,
          total,
          status: 'pending_validation',
        })
        .select()
        .single();

      const invoice = invoiceData as { id: string; invoice_number: string; total: number } | null;

      if (invoiceError) throw invoiceError;

      // Update intervention status to billed
      await supabase
        .from('interventions')
        .update({ status: 'billed' })
        .eq('id', report.intervention_id);

      return NextResponse.json({
        success: true,
        action: 'validated',
        report_id: payload.report_id,
        invoice_created: true,
        invoice_id: invoice?.id,
        invoice_number: invoice?.invoice_number,
        total: invoice?.total,
      });
    }

    return NextResponse.json({
      success: true,
      action: 'validated',
      report_id: payload.report_id,
      invoice_created: false,
      reason: 'no_line_items',
    });
  } catch (error) {
    console.error('Invoice validation error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors de la validation' },
      { status: 500 }
    );
  }
}
