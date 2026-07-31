const crypto = require('crypto');
const db = require('./db');

const REMINDER_DAYS = [3, 7, 14];

class ReminderService {
  scheduleForInvoice(invoiceId) {
    for (const day of REMINDER_DAYS) {
      db.createInvoiceReminder({
        reminderId: `rem_${crypto.randomUUID().slice(0, 8)}`,
        invoiceId,
        dayOffset: day,
        status: 'pending'
      });
    }
  }

  getDueReminders() {
    return db.getDueInvoiceReminders(REMINDER_DAYS);
  }

  formatReminderMessage(invoice, dayOffset) {
    return (
      `🔔 Payment Reminder (Day ${dayOffset})\n\n` +
      `Invoice ${invoice.invoice_id} for ${invoice.recipient} is still unpaid.\n` +
      `Amount: ${invoice.amount} ${invoice.currency}\n` +
      `Due: ${invoice.due_date}\n\n` +
      `Send a gentle nudge to your customer or share the payment link again.`
    );
  }

  markSent(reminderId) {
    db.updateInvoiceReminderStatus(reminderId, 'sent');
  }
}

module.exports = new ReminderService();
