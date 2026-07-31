const crypto = require('crypto');
const db = require('./db');

class CustomerService {
  upsertCustomer(userId, { name, email, phone, notes }) {
    const existing = db.findCustomerByName(userId, name);
    if (existing) {
      db.updateCustomer(existing.customer_id, { email, phone, notes });
      return existing.customer_id;
    }

    const customerId = `cust_${crypto.randomUUID().slice(0, 8)}`;
    db.createCustomer({ customerId, userId, name, email, phone, notes });
    return customerId;
  }

  listCustomers(userId, limit = 10) {
    return db.getCustomers(userId, limit);
  }

  formatCustomerList(customers) {
    if (!customers.length) {
      return 'No saved customers yet. They are added automatically when you create invoices.';
    }
    return customers
      .map((c, i) => `${i + 1}. ${c.name}${c.email ? ` (${c.email})` : ''} — ${c.invoice_count || 0} invoices`)
      .join('\n');
  }

  recordInvoiceForCustomer(customerId) {
    if (customerId) {
      db.incrementCustomerInvoiceCount(customerId);
    }
  }
}

module.exports = new CustomerService();
