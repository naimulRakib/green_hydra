'use server'

import { createClient } from '@/app/utils/supabase/server'

/**
 * Verify (confirm) or reject a scan log result.
 * Called by farmers from the DiseaseScanner result card.
 */
export async function confirmScanResult(
  scanLogId: string,
  action: 'verify' | 'reject',
  feedback?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { success: false, message: 'লগইন করুন।' }
    }

    // Ensure this scan belongs to the farmer
    const { data: scan, error: fetchErr } = await supabase
      .from('scan_logs')
      .select('id, farmer_id, verification_status')
      .eq('id', scanLogId)
      .maybeSingle()

    if (fetchErr || !scan) {
      return { success: false, message: 'স্ক্যান খুঁজে পাওয়া যায়নি।' }
    }

    if (scan.farmer_id !== user.id) {
      return { success: false, message: 'এই স্ক্যান আপনার নয়।' }
    }

    if (scan.verification_status === 'verified' || scan.verification_status === 'rejected') {
      return { success: false, message: 'এই স্ক্যান ইতোমধ্যে যাচাই করা হয়েছে।' }
    }

    const updateData: Record<string, unknown> = {
      verification_status: action === 'verify' ? 'verified' : 'rejected',
      verified_at: new Date().toISOString(),
      verified_by_farmer_id: user.id,
    }

    // If rejected, store feedback in environmental_context.farmer_feedback
    if (action === 'reject' && feedback) {
      const { data: current } = await supabase
        .from('scan_logs')
        .select('environmental_context')
        .eq('id', scanLogId)
        .single()

      const existingCtx = (current?.environmental_context ?? {}) as Record<string, unknown>
      updateData.environmental_context = {
        ...existingCtx,
        farmer_feedback: feedback,
        rejected_at: new Date().toISOString(),
      }
    }

    const { error: updateErr } = await supabase
      .from('scan_logs')
      .update(updateData)
      .eq('id', scanLogId)

    if (updateErr) {
      console.error('[ConfirmScan] Update failed:', updateErr.message)
      return { success: false, message: 'আপডেট করতে সমস্যা হয়েছে।' }
    }

    // If verified with good confidence, bump rag_trust_weight
    if (action === 'verify') {
      await supabase
        .from('scan_logs')
        .update({ rag_trust_weight: 0.80 })
        .eq('id', scanLogId)
        .gte('ai_confidence', 0.60)
    }

    return {
      success: true,
      message: action === 'verify'
        ? '✅ ফলাফল সঠিক হিসেবে চিহ্নিত করা হয়েছে। ধন্যবাদ!'
        : '❌ ফলাফল ভুল হিসেবে চিহ্নিত করা হয়েছে। আপনার মতামত রেকর্ড করা হয়েছে।',
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[ConfirmScan] Error:', message)
    return { success: false, message: 'সমস্যা হয়েছে।' }
  }
}
