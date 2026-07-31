const crypto = require('crypto');
const db = require('./db');

const CATEGORIES = ['office', 'travel', 'utilities', 'payroll', 'marketing', 'supplies', 'meals', 'other'];

class ExpenseService {
  getCategories() {
    return CATEGORIES;
  }

  logExpense({ userId, amount, currency, category, merchant, description, receiptRef }) {
    const expenseId = `exp_${crypto.randomUUID().slice(0, 8)}`;
    db.createExpense({
      expenseId,
      userId,
      amount,
      currency: currency || 'USDC',
      category: category || 'other',
      merchant: merchant || null,
      description: description || null,
      receiptRef: receiptRef || null
    });
    return { expenseId, amount, currency, category };
  }

  listExpenses(userId, limit = 10) {
    return db.getExpenses(userId, limit);
  }

  formatExpenseList(expenses) {
    if (!expenses.length) return 'No expenses logged yet. Send a receipt photo to log one.';
    return expenses
      .map((e) => `• ${e.merchant || 'Expense'} — ${e.amount} ${e.currency} [${e.category}]`)
      .join('\n');
  }

  getTaxSummary(userId) {
    return db.getExpenseSummaryByCategory(userId);
  }

  formatTaxReport(summary) {
    if (!summary.length) return 'No expenses to report yet.';
    const lines = summary.map((row) => `• ${row.category}: ${row.total.toFixed(2)} ${row.currency}`);
    const grand = summary.reduce((s, r) => s + r.total, 0);
    return `📊 Expense Report\n\n${lines.join('\n')}\n\nTotal: ${grand.toFixed(2)}`;
  }
}

module.exports = new ExpenseService();
