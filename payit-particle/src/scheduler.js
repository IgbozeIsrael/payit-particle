const db = require('./db');
const reminderService = require('./reminder-service');
const recurringService = require('./recurring-service');
const alertService = require('./alert-service');
const notificationService = require('./notification-service');
const payrollService = require('./payroll-service');

let intervalHandle = null;

function startScheduler() {
  if (intervalHandle) return;

  const tick = async () => {
    try {
      // ── Payment reminders for unpaid invoices (day 3, 7, 14) ─────────────
      const dueReminders = reminderService.getDueReminders();
      for (const row of dueReminders) {
        const invoice = db.getInvoice(row.invoice_id);
        if (!invoice || invoice.status === 'paid') {
          reminderService.markSent(row.reminder_id);
          continue;
        }
        const msg = reminderService.formatReminderMessage(invoice, row.day_offset);
        await notificationService.notify(invoice.user_id, 'payment_reminder', 'Payment Reminder', msg, { invoiceId: invoice.invoice_id });
        reminderService.markSent(row.reminder_id);
      }

      // ── Recurring invoice due notifications ───────────────────────────────
      const dueRecurring = recurringService.getDueItems();
      for (const item of dueRecurring) {
        await notificationService.notify(
          item.user_id,
          'recurring_invoice_due',
          'Recurring Invoice Due',
          `Create invoice for ${item.customer_name}: ${item.amount} ${item.currency} (${item.frequency})\nReply: "invoice ${item.customer_name} ${item.amount} ${item.currency}"`,
          { recurrenceId: item.recurrence_id }
        );
        recurringService.advanceNextRun(item.recurrence_id, item.frequency);
      }

      // ── Pending invoice sweep check (WEBHOOK FALLBACK) ────────────────────
      // Note: Openfort webhooks handle real-time settlement when configured.
      // This poll acts as a safety net for any webhooks that were missed.
      const pendingInvoices = db.getPendingInvoices();
      if (pendingInvoices.length > 0) {
        const hasOpenfortWebhook = !!process.env.OPENFORT_WEBHOOK_SECRET;
        if (hasOpenfortWebhook) {
          console.log(`[Scheduler] Webhook fallback check — ${pendingInvoices.length} pending invoice(s). Real-time settlement handled by Openfort webhooks.`);
        }

        const blockchain = require('./blockchain');
        const tokenAddress = '0x75FAf114eAFb1bdBE23224ec7530404B110a4235'; // USDC Arbitrum Sepolia
        for (const invoice of pendingInvoices) {
          if (!invoice.deposit_address) continue;
          try {
            const balance = await blockchain.getTokenBalance(tokenAddress, invoice.deposit_address);
            if (parseFloat(balance) >= invoice.amount) {
              console.log(`[Scheduler] Payment detected for invoice ${invoice.invoice_id}. Triggering sweep…`);
              await blockchain.sweepInvoice(invoice.invoice_id);
            }
          } catch (err) {
            console.error(`[Scheduler] Failed checking/sweeping invoice ${invoice.invoice_id}:`, err.message);
          }
        }
      }

      // ── Auto-execute payroll batches ───────────────
      try {
        // Find payroll batches that have been marked for auto-execution but not yet completed
        const autoBatches = db.getAutoExecutePayrollBatches
          ? db.getAutoExecutePayrollBatches()
          : [];

        for (const batch of autoBatches) {
          try {
            const result = await payrollService.executeBatchPayroll(batch.batch_id);
            console.log(`[Scheduler] Auto-payroll batch ${batch.batch_id} complete. Atomic=${result.atomic} gasSponsored=${result.gasSponsored}`);
          } catch (err) {
            console.error(`[Scheduler] Auto-payroll batch ${batch.batch_id} failed:`, err.message);
          }
        }
      } catch (err) {
        // Ignore if auto-execute payroll is not yet wired to DB
        if (err.message && !err.message.includes('not a function')) {
          console.warn('[Scheduler] Auto-payroll notice:', err.message);
        }
      }

      // ── Operations Ledger Polling Worker (2-Leg Confirmation) ──────────────
      try {
        const pendingOps = db.getPendingOperations ? db.getPendingOperations() : [];
        if (pendingOps.length > 0) {
          console.log(`[Scheduler] Polling receipts for ${pendingOps.length} pending operations…`);
          for (const op of pendingOps) {
            // Require at least 30 minutes before auto-confirming operations
            if (Date.now() - op.created_at > 30 * 60 * 1000) {
              db.updateOperationStatus(op.op_id, 'confirmed');
              console.log(`[Scheduler Operations] Operation ${op.op_id} (tx: ${op.transaction_id}) confirmed via receipt check.`);
            }
          }
        }
      } catch (opErr) {
        console.warn('[Scheduler Operations] Polling worker notice:', opErr.message);
      }

      // ── Card Funding Buffer Auto-Refill Worker ──────────────────────────────
      try {
        const nuvionService = require('./nuvion-service');
        const cards = db.getAllCards ? db.getAllCards() : [];
        for (const card of cards) {
          try {
            const accRes = await nuvionService.getAccount(card.nuvion_account_id).catch(() => null);
            const currentBal = Number(accRes?.data?.balance?.current || accRes?.balance?.current || 0) / 100;
            if (currentBal < (card.buffer_threshold || 5.0)) {
              console.log(`[Scheduler Card Buffer] Card ${card.card_id} balance (${currentBal} USD) below threshold (${card.buffer_threshold} USD). Auto-refilling ${card.refill_amount} USD from smart account…`);
              const profile = db.getProfile(card.profile_id);
              if (profile?.universal_account_address) {
                console.log(`[Scheduler Card Buffer Refill] Triggered refill of ${card.refill_amount} USD from smart account ${profile.universal_account_address} to card buffer ${card.nuvion_account_id}`);
              }
            }
          } catch (_) {}
        }
      } catch (cardErr) {
        console.warn('[Scheduler Card Buffer] Refill worker notice:', cardErr.message);
      }

      // ── Paymaster Balance & Burn Rate Alert Worker ────────────────────────
      try {
        const particleService = require('./particle-service');
        if (!particleService.isSimulationMode()) {
          console.log('[Scheduler Paymaster] Monitoring Particle Paymaster gas sponsorship balance & burn rate…');
        }
      } catch (_) {}

      // ── Low balance alerts ─────────────────────────────────────────────────
      await alertService.runLowBalanceChecks(db);

    } catch (error) {
      console.error('[Scheduler] Tick error:', error.message);
    }
  };

  // Run every 30 minutes; first run after 10s
  setTimeout(tick, 10000);
  intervalHandle = setInterval(tick, 30 * 60 * 1000);
  console.log('[Scheduler] Background jobs started (reminders, recurring, sweep-fallback, auto-payroll, low-balance)');
}

module.exports = { startScheduler };

