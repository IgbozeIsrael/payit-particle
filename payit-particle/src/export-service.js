const ExcelJS = require('exceljs');

/**
 * Generate a comprehensive Invoice Report
 * @param {Array} invoices - list of invoices from db
 * @returns {Buffer} - The generated Excel file buffer
 */
async function generateInvoiceReport(invoices) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PayIT Platform';
  workbook.lastModifiedBy = 'PayIT Bot';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Invoice Balance Sheet');

  sheet.columns = [
    { header: 'Invoice ID', key: 'invoice_id', width: 15 },
    { header: 'Customer', key: 'recipient', width: 20 },
    { header: 'Due Date', key: 'due_date', width: 15 },
    { header: 'Expected Amount', key: 'amount', width: 15 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Amount Paid', key: 'paid', width: 15 },
    { header: 'Difference', key: 'diff', width: 15 },
    { header: 'Status', key: 'status', width: 15 }
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004B87' } };

  for (const inv of invoices) {
    const isPaid = inv.status === 'paid' || inv.status === 'settled';
    const amountPaid = isPaid ? inv.amount : 0;
    const diff = amountPaid - inv.amount;

    sheet.addRow({
      invoice_id: inv.invoice_id,
      recipient: inv.recipient,
      due_date: inv.due_date,
      amount: inv.amount,
      currency: inv.currency,
      paid: amountPaid,
      diff: diff,
      status: inv.status.toUpperCase()
    });
  }

  // Formatting numbers
  sheet.getColumn('amount').numFmt = '#,##0.00';
  sheet.getColumn('paid').numFmt = '#,##0.00';
  sheet.getColumn('diff').numFmt = '#,##0.00';

  return await workbook.xlsx.writeBuffer();
}

/**
 * Generate a full Business Financial Report
 */
async function generateBusinessReport(invoices, deposits, transactions, expenses) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PayIT Platform';

  // --- SHEET 1: INCOME ---
  const incomeSheet = workbook.addWorksheet('Income');
  incomeSheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Type', key: 'type', width: 15 },
    { header: 'Source', key: 'source', width: 20 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Status', key: 'status', width: 15 }
  ];
  incomeSheet.getRow(1).font = { bold: true };

  let totalIncomeUsd = 0;

  for (const inv of invoices || []) {
    if (inv.status === 'paid' || inv.status === 'settled') {
      incomeSheet.addRow({
        date: new Date(inv.created_at).toISOString().split('T')[0],
        type: 'Invoice',
        source: inv.recipient,
        amount: inv.amount,
        currency: inv.currency,
        status: inv.status
      });
      // Naive conversion for hackathon
      totalIncomeUsd += inv.currency === 'USDC' ? inv.amount : inv.amount / 1600;
    }
  }

  // --- SHEET 2: EXPENDITURES ---
  const expenseSheet = workbook.addWorksheet('Expenditures');
  expenseSheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Recipient', key: 'recipient', width: 20 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Currency', key: 'currency', width: 10 }
  ];
  expenseSheet.getRow(1).font = { bold: true };

  let totalExpensesUsd = 0;

  for (const tx of transactions || []) {
    expenseSheet.addRow({
      date: new Date(tx.timestamp).toISOString().split('T')[0],
      category: 'Transfer/Payroll',
      recipient: tx.recipient,
      amount: tx.amount,
      currency: tx.token
    });
    totalExpensesUsd += tx.token === 'USDC' ? tx.amount : tx.amount / 1600;
  }

  // --- SHEET 3: SUMMARY ---
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Amount (USD Equivalent)', key: 'amount', width: 25 }
  ];
  summarySheet.getRow(1).font = { bold: true };

  const netProfit = totalIncomeUsd - totalExpensesUsd;
  const estimatedTax = netProfit > 0 ? netProfit * 0.15 : 0; // Simulated 15% flat tax

  summarySheet.addRow({ metric: 'Total Income', amount: totalIncomeUsd });
  summarySheet.addRow({ metric: 'Total Expenditures', amount: totalExpensesUsd });
  summarySheet.addRow({ metric: 'Net Profit', amount: netProfit });
  summarySheet.addRow({ metric: 'Estimated Tax Liability (15%)', amount: estimatedTax });

  summarySheet.getColumn('amount').numFmt = '$#,##0.00';

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateInvoiceReport,
  generateBusinessReport
};
