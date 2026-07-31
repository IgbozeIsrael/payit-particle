const ExcelJS = require('exceljs');
const db = require('./db');

async function generateBalanceSheet(telegramId) {
  const user = db.getUser(telegramId);
  if (!user) throw new Error('User not found');

  const invoices = db.getUserInvoices(telegramId) || [];
  const transactions = db.getTransactions(telegramId) || [];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PayIT Bot';
  workbook.lastModifiedBy = 'PayIT Bot';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Create Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 30 }
  ];

  summarySheet.addRow({ metric: 'Business Name', value: user.business_name || 'Not Set' });
  summarySheet.addRow({ metric: 'Business Email', value: user.business_email || 'Not Set' });
  summarySheet.addRow({ metric: 'Business Address', value: user.business_address || 'Not Set' });
  summarySheet.addRow({});

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const paidInvoices = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (inv.amount || 0), 0);
  
  summarySheet.addRow({ metric: 'Total Invoiced (USD)', value: totalInvoiced });
  summarySheet.addRow({ metric: 'Total Paid Invoices (USD)', value: paidInvoices });
  summarySheet.addRow({ metric: 'Outstanding Receivables (USD)', value: totalInvoiced - paidInvoices });
  summarySheet.addRow({});
  
  const totalExpenses = transactions
    .filter(tx => tx.sender === user.business_smart_account)
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  
  summarySheet.addRow({ metric: 'Total Expenditures (USD)', value: totalExpenses });
  summarySheet.addRow({ metric: 'Net Profit Estimate (USD)', value: paidInvoices - totalExpenses });

  // Style the Summary sheet headers
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD7E3FF' } };

  // Create Invoices Sheet (Income)
  const incomeSheet = workbook.addWorksheet('Invoices (Income)');
  incomeSheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Invoice ID', key: 'invoice_id', width: 20 },
    { header: 'Customer', key: 'customer', width: 25 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Status', key: 'status', width: 15 }
  ];

  invoices.forEach(inv => {
    incomeSheet.addRow({
      date: new Date(inv.created_at).toISOString().split('T')[0],
      invoice_id: inv.invoice_id,
      customer: inv.recipient,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status.toUpperCase()
    });
  });

  incomeSheet.getRow(1).font = { bold: true };
  incomeSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD7E3FF' } };

  // Create Transactions Sheet (Expenditures)
  const expenseSheet = workbook.addWorksheet('Transactions (Expenditures)');
  expenseSheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Tx Hash', key: 'tx_hash', width: 20 },
    { header: 'To Address', key: 'recipient', width: 45 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Token', key: 'token', width: 10 },
    { header: 'Status', key: 'status', width: 15 }
  ];

  transactions
    .filter(tx => tx.sender === user.business_smart_account)
    .forEach(tx => {
      expenseSheet.addRow({
        date: new Date(tx.timestamp).toISOString().split('T')[0],
        tx_hash: tx.tx_hash,
        recipient: tx.recipient,
        amount: tx.amount,
        token: tx.token,
        status: tx.status.toUpperCase()
      });
    });

  expenseSheet.getRow(1).font = { bold: true };
  expenseSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD7E3FF' } };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = { generateBalanceSheet };
