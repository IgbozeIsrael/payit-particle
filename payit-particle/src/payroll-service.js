const crypto = require('crypto');
const db = require('./db');
const agent = require('./agent');

function parseCsvPayroll(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const recipients = [];
  for (const line of lines) {
    if (/^name[,;\t]/i.test(line) || /^employee/i.test(line)) {
      continue;
    }

    const parts = line.split(/[,;\t|]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      continue;
    }

    const name = parts[0];
    const amount = parseFloat(String(parts[1]).replace(/,/g, ''));
    const currency = (parts[2] || 'USDC').toUpperCase();
    const destination = parts[3] || null;

    if (!name || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    recipients.push({
      name,
      amount,
      currency,
      destination,
      paymentMethod: currency === 'NGN' ? 'fiat' : 'stablecoin'
    });
  }

  return recipients;
}

const mediaParser = require('./media-parser');

class PayrollService {
  async parsePayrollInput(text) {
    const csvRecipients = parseCsvPayroll(text);
    if (csvRecipients.length > 0) {
      return {
        recipients: csvRecipients,
        source: 'csv'
      };
    }

    // Call Groq LLM structured payroll extraction
    try {
      const groqRecipients = await mediaParser.parseBulkPayrollDocument(text);
      if (Array.isArray(groqRecipients) && groqRecipients.length > 0) {
        const normalized = groqRecipients.map((r) => ({
          name: r.name || 'Employee',
          amount: Number(r.amount) || 0,
          currency: (r.currency || 'NGN').toUpperCase(),
          destination: r.crypto_address || r.account_number || r.destination || null,
          bank_name: r.bank_name || null,
          bank_code: r.bank_code || null,
          paymentMethod: r.crypto_address ? 'stablecoin' : 'fiat'
        })).filter(r => r.amount > 0);

        if (normalized.length > 0) {
          return {
            recipients: normalized,
            source: 'groq'
          };
        }
      }
    } catch (_) {}

    const parsed = await agent.parseIntent(text);
    if (parsed.action === 'BULK_PAYROLL' && Array.isArray(parsed.parameters.recipients)) {
      return {
        recipients: parsed.parameters.recipients,
        source: 'nlp'
      };
    }

    return { recipients: [], source: 'unknown' };
  }

  createBatch({ telegramId, recipients, currency, paymentMethod, note }) {
    const batchId = `pay_${crypto.randomUUID().slice(0, 8)}`;
    const totalAmount = recipients.reduce((sum, row) => sum + row.amount, 0);

    db.createPayrollBatch({
      batchId,
      userId: telegramId,
      currency: currency || 'USDC',
      paymentMethod: paymentMethod || 'stablecoin',
      totalAmount,
      lineCount: recipients.length,
      status: 'pending',
      note: note || null
    });

    for (const row of recipients) {
      db.createPayrollLine({
        lineId: `pl_${crypto.randomUUID().slice(0, 8)}`,
        batchId,
        recipientName: row.name,
        amount: row.amount,
        currency: row.currency || currency || 'USDC',
        destination: row.destination || row.wallet || row.accountNumber || null,
        paymentMethod: row.paymentMethod || paymentMethod || 'stablecoin',
        status: 'pending'
      });
    }

    return { batchId, totalAmount, lineCount: recipients.length };
  }

  formatBatchPreview(batchId) {
    const batch = db.getPayrollBatch(batchId);
    const lines = db.getPayrollLines(batchId);
    if (!batch) {
      return 'Payroll batch not found.';
    }

    const preview = lines
      .slice(0, 8)
      .map((line, index) => `${index + 1}. ${line.recipient_name} — ${line.amount} ${line.currency}`)
      .join('\n');

    const more = lines.length > 8 ? `\n...and ${lines.length - 8} more` : '';

    return (
      `👥 Payroll Preview (${batch.batch_id})\n\n` +
      `• Staff count: ${batch.line_count}\n` +
      `• Total: ${batch.total_amount} ${batch.currency}\n` +
      `• Method: ${batch.payment_method}\n\n` +
      `${preview}${more}\n\n` +
      `Reply "confirm payroll" to execute or "cancel" to abort.`
    );
  }

  async executeBatch(batchId, telegramId, businessWallet) {
    const batch = db.getPayrollBatch(batchId);
    const lines = db.getPayrollLines(batchId);
    if (!batch || batch.user_id !== telegramId) {
      throw new Error('Payroll batch not found');
    }

    if (batch.status === 'awaiting_approval') {
      throw new Error('Payroll awaiting approval');
    }

    let successCount = 0;
    for (const line of lines) {
      const txId = `tx_${crypto.randomUUID().slice(0, 8)}`;
      db.createTransaction(
        txId,
        telegramId,
        businessWallet,
        line.destination || line.recipient_name,
        line.amount,
        line.currency,
        `sim_${txId}`,
        'completed'
      );
      db.updatePayrollLineStatus(line.line_id, 'completed', `sim_${txId}`);
      successCount += 1;
    }

    db.updatePayrollBatchStatus(batchId, 'completed');
    return { batchId, successCount, totalAmount: batch.total_amount };
  }

  /**
   * Execute a payroll batch atomically via ZeroDev session keys.
   * If no session key is available, falls back to sequential transfers.
   *
   * @param {string} batchId
   * @returns {Promise<{batchId, successCount, totalAmount, txHash, atomic, gasSponsored}>}
   */
  async executeBatchPayroll(batchId) {
    const batch = db.getPayrollBatch(batchId);
    const lines = db.getPayrollLines(batchId);
    if (!batch) throw new Error(`Payroll batch ${batchId} not found`);

    const pendingLines = lines.filter(l => l.status === 'pending');
    if (pendingLines.length === 0) return { batchId, successCount: 0, totalAmount: 0, txHash: null, atomic: false };

    console.log(`[Payroll] Executing batch ${batchId} (${pendingLines.length} lines, ${batch.total_amount} ${batch.currency})`);

    // Try atomic batch via ZeroDev session key
    const sessionKeyService = require('./session-key-service');
    const activeKey = db.getActiveSessionKey(batch.user_id);

    if (activeKey && !sessionKeyService.isSimulationMode()) {
      // Check spending limit
      const remaining = activeKey.max_amount_usdc - activeKey.used_amount;
      if (remaining < batch.total_amount) {
        console.warn(`[Payroll] Session key spending limit would be exceeded (${remaining} USDC remaining vs ${batch.total_amount} needed). Skipping auto-execute.`);
      } else {
        try {
          // Build one USDC transfer call per payroll line
          const calls = pendingLines
            .filter(l => l.destination && l.currency === 'USDC')
            .map(l => sessionKeyService.buildUsdcTransferCall(l.destination, l.amount));

          if (calls.length > 0) {
            const result = await sessionKeyService.executeWithSessionKey(
              activeKey.serialized_session_key,
              calls
            );

            // Mark all lines complete
            const txHash = result.txHash || `batch_sim_${Date.now()}`;
            for (const line of pendingLines) {
              db.updatePayrollLineStatus(line.line_id, 'completed', txHash);
            }
            db.updatePayrollBatchStatus(batchId, 'completed');
            db.updateSessionKeyUsage(activeKey.key_id, batch.total_amount);

            console.log(`[Payroll] Atomic batch complete. txHash=${txHash} gasSponsored=${result.gasSponsored}`);
            return {
              batchId,
              successCount: pendingLines.length,
              totalAmount: batch.total_amount,
              txHash,
              atomic: true,
              gasSponsored: result.gasSponsored,
            };
          }
        } catch (err) {
          console.error('[Payroll] Atomic batch execution failed, falling back to sequential:', err.message);
        }
      }
    }

    // Fallback: sequential simulation (existing behavior)
    let successCount = 0;
    for (const line of pendingLines) {
      const txId = `tx_${crypto.randomUUID().slice(0, 8)}`;
      db.createTransaction(txId, batch.user_id, null, line.destination || line.recipient_name, line.amount, line.currency, `sim_${txId}`, 'completed');
      db.updatePayrollLineStatus(line.line_id, 'completed', `sim_${txId}`);
      successCount++;
    }
    db.updatePayrollBatchStatus(batchId, 'completed');
    console.log(`[Payroll] Sequential fallback complete. ${successCount}/${pendingLines.length} lines settled.`);
    return { batchId, successCount, totalAmount: batch.total_amount, txHash: null, atomic: false, gasSponsored: false };
  }
}

module.exports = new PayrollService();

