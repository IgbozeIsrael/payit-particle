const crypto = require('crypto');
const db = require('./db');

function addInterval(fromIso, frequency) {
  const date = new Date(fromIso);
  if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  } else {
    date.setDate(date.getDate() + 30);
  }
  return date.toISOString();
}

class RecurringService {
  create({ userId, customerName, amount, currency, frequency }) {
    const recurrenceId = `rec_${crypto.randomUUID().slice(0, 8)}`;
    const nextRun = addInterval(new Date().toISOString(), frequency);
    db.createRecurringInvoice({
      recurrenceId,
      userId,
      customerName,
      amount,
      currency: currency || 'USDC',
      frequency: frequency || 'monthly',
      nextRun,
      active: 1
    });
    return { recurrenceId, customerName, amount, currency, frequency, nextRun };
  }

  listActive(userId) {
    return db.getActiveRecurringInvoices(userId);
  }

  formatList(items) {
    if (!items.length) return 'No recurring invoices set up yet.';
    return items
      .map((r) => `• ${r.customer_name} — ${r.amount} ${r.currency} (${r.frequency}), next: ${new Date(r.next_run).toLocaleDateString()}`)
      .join('\n');
  }

  getDueItems() {
    return db.getDueRecurringInvoices();
  }

  advanceNextRun(recurrenceId, frequency) {
    const item = db.getRecurringInvoice(recurrenceId);
    if (!item) return;
    const nextRun = addInterval(item.next_run, frequency || item.frequency);
    db.updateRecurringNextRun(recurrenceId, nextRun);
  }
}

module.exports = new RecurringService();
