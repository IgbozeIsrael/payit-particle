const db = require('./db');
const customerService = require('./customer-service');
const recurringService = require('./recurring-service');
const expenseService = require('./expense-service');
const savingsGoalService = require('./savings-goal-service');
const approvalService = require('./approval-service');
const notificationService = require('./notification-service');
const payrollService = require('./payroll-service');

function parseGoalFromText(text) {
  const clean = String(text || '');
  const amountMatch = clean.match(/([\d,.]+)\s*(ngn|usdc|₦|\$)?/i);
  const dateMatch = clean.match(/by\s+([a-zA-Z]+\s*\d{0,4}|\d{4}-\d{2}-\d{2})/i);
  const titleMatch = clean.match(/(?:for|goal)\s+(.+?)(?:\s+by\s+|\s*$)/i);

  if (!amountMatch) return null;

  let currency = (amountMatch[2] || 'USDC').toUpperCase();
  if (currency === '₦') currency = 'NGN';
  if (currency === '$') currency = 'USDC';

  return {
    targetAmount: parseFloat(amountMatch[1].replace(/,/g, '')),
    currency,
    title: titleMatch ? titleMatch[1].trim() : 'Savings Goal',
    targetDate: dateMatch ? dateMatch[1] : null
  };
}

async function handleFeatureIntent(telegramId, parsed, session, user) {
  if (!parsed || !parsed.action) return null;
  const p = parsed.parameters || {};

  switch (parsed.action) {
    case 'CUSTOMER_DIRECTORY': {
      const customers = customerService.listCustomers(telegramId);
      return {
        reply: `📋 Customer Directory\n\n${customerService.formatCustomerList(customers)}`
      };
    }

    case 'RECURRING_INVOICE': {
      if (user.active_context !== 'business') {
        return { reply: 'Recurring invoices require business profile. Switch to business first.' };
      }
      if (p.recipientIdentifier && p.amount) {
        const rec = recurringService.create({
          userId: telegramId,
          customerName: p.recipientIdentifier,
          amount: p.amount,
          currency: p.currency || 'USDC',
          frequency: p.frequency || 'monthly'
        });
        return {
          reply:
            `📅 Recurring Invoice Created!\n\n` +
            `• Customer: ${rec.customerName}\n` +
            `• Amount: ${rec.amount} ${rec.currency}\n` +
            `• Frequency: ${rec.frequency}\n` +
            `• Next run: ${new Date(rec.nextRun).toLocaleDateString()}`
        };
      }
      session.state = 'AWAITING_RECURRING_DATA';
      return { reply: 'Enter recurring invoice: "Customer Name 500 USDC monthly"' };
    }

    case 'LIST_RECURRING': {
      const items = recurringService.listActive(telegramId);
      return { reply: `📅 Recurring Invoices\n\n${recurringService.formatList(items)}` };
    }

    case 'EXPENSE_LOG':
    case 'RECEIPT_OCR': {
      if (p.amount) {
        const exp = expenseService.logExpense({
          userId: telegramId,
          amount: p.amount,
          currency: p.currency || 'USDC',
          category: p.category || 'other',
          merchant: p.merchant || p.recipientIdentifier,
          description: p.memo
        });
        return {
          reply:
            `🧾 Expense Logged!\n\n` +
            `• ${exp.amount} ${exp.currency}\n` +
            `• Category: ${exp.category}\n` +
            `• ID: ${exp.expenseId}`
        };
      }
      session.state = 'AWAITING_EXPENSE_PHOTO';
      return { reply: 'Send a receipt photo or type: "Expense 5000 NGN office supplies at Shoprite"' };
    }

    case 'EXPENSE_REPORT': {
      const summary = expenseService.getTaxSummary(telegramId);
      return { reply: expenseService.formatTaxReport(summary) };
    }

    case 'LIST_EXPENSES': {
      const expenses = expenseService.listExpenses(telegramId);
      return { reply: `🧾 Recent Expenses\n\n${expenseService.formatExpenseList(expenses)}` };
    }

    case 'SAVINGS_GOAL': {
      const goalData = p.targetAmount
        ? { targetAmount: p.targetAmount, currency: p.currency || 'USDC', title: p.goalTitle || 'Savings Goal', targetDate: p.targetDate }
        : parseGoalFromText(p.memo || parsed.rawText || '');
      if (!goalData || !goalData.targetAmount) {
        session.state = 'AWAITING_GOAL_DATA';
        return { reply: 'Set a goal: "Save 500000 NGN for rent by December"' };
      }
      const goal = savingsGoalService.create({
        userId: telegramId,
        title: goalData.title,
        targetAmount: goalData.targetAmount,
        currency: goalData.currency,
        targetDate: goalData.targetDate
      });
      return {
        reply:
          `🎯 Savings Goal Created!\n\n` +
          `• ${goal.title}\n` +
          `• Target: ${goal.targetAmount} ${goal.currency}\n` +
          `• Due: ${goal.targetDate || 'No deadline'}\n\n` +
          savingsGoalService.formatGoal({ ...goal, current_amount: 0 })
      };
    }

    case 'LIST_GOALS': {
      const goals = savingsGoalService.listActive(telegramId);
      return { reply: `🎯 Savings Goals\n\n${savingsGoalService.formatGoalList(goals)}` };
    }

    case 'SET_LOW_BALANCE_ALERT': {
      const threshold = p.amount || p.threshold;
      if (!threshold) {
        session.state = 'AWAITING_BALANCE_THRESHOLD';
        return { reply: 'Enter low balance alert amount in USD (e.g. 50):' };
      }
      db.updateLowBalanceThreshold(telegramId, threshold);
      return { reply: `🔔 Low balance alert set to $${threshold}. You will be notified when balance drops below this.` };
    }

    case 'SET_PAYROLL_APPROVAL': {
      if (user.active_context !== 'business') {
        return { reply: 'Payroll approval is a business feature.' };
      }
      const threshold = p.amount || p.threshold;
      const approver = p.approverTelegramId || p.recipientIdentifier;
      if (!threshold || !approver) {
        session.state = 'AWAITING_APPROVAL_SETUP';
        return { reply: 'Set payroll approval: "Require approval above 5000 USDC approver @username"' };
      }
      db.updatePayrollApprovalSettings(telegramId, threshold, approver);
      return {
        reply:
          `✋ Payroll Approval Enabled\n\n` +
          `• Threshold: ${threshold} USDC\n` +
          `• Approver: ${approver}\n` +
          `Payroll above this amount needs approver confirmation.`
      };
    }

    case 'APPROVE_PAYROLL': {
      const approvalId = p.approvalId || (p.memo || '').match(/apr_[a-z0-9]+/i)?.[0];
      if (!approvalId) return { reply: 'Usage: approve apr_xxxx' };
      const result = approvalService.approve(approvalId, telegramId);
      if (!result.ok) return { reply: `❌ ${result.reason}` };
      const batch = db.getPayrollBatch(result.batchId);
      const owner = db.getUser(batch.user_id);
      await payrollService.executeBatch(result.batchId, batch.user_id, owner.business_smart_account);
      return { reply: `✅ Payroll ${result.batchId} approved and executed.` };
    }

    case 'REJECT_PAYROLL': {
      const approvalId = p.approvalId || (p.memo || '').match(/apr_[a-z0-9]+/i)?.[0];
      if (!approvalId) return { reply: 'Usage: reject apr_xxxx' };
      const result = approvalService.reject(approvalId, telegramId);
      if (!result.ok) return { reply: `❌ ${result.reason}` };
      return { reply: `❌ Payroll batch rejected.` };
    }

    default:
      return null;
  }
}

async function requestPayrollApprovalIfNeeded({ telegramId, user, batchId, totalAmount }) {
  if (!approvalService.needsApproval(user, totalAmount)) {
    return null;
  }
  const approverId = user.approver_telegram_id;
  if (!approverId) {
    return { needsApproval: false, warning: 'No approver configured. Set one in Settings.' };
  }
  const approvalId = approvalService.createApprovalRequest({
    batchId,
    requesterId: telegramId,
    approverId,
    totalAmount
  });
  const batch = db.getPayrollBatch(batchId);
  const approval = db.getPayrollApproval(approvalId);
  await notificationService.notify(approverId, approvalService.formatApprovalRequest(approval, batch));
  return { needsApproval: true, approvalId };
}

module.exports = {
  handleFeatureIntent,
  requestPayrollApprovalIfNeeded,
  parseGoalFromText
};
