const crypto = require('crypto');
const db = require('./db');

class ApprovalService {
  needsApproval(user, totalAmount) {
    const threshold = user.payroll_approval_threshold || 0;
    return threshold > 0 && totalAmount >= threshold;
  }

  createApprovalRequest({ batchId, requesterId, approverId, totalAmount }) {
    const approvalId = `apr_${crypto.randomUUID().slice(0, 8)}`;
    db.createPayrollApproval({
      approvalId,
      batchId,
      requesterId,
      approverId,
      totalAmount,
      status: 'pending'
    });
    db.updatePayrollBatchStatus(batchId, 'awaiting_approval');
    return approvalId;
  }

  approve(approvalId, approverId) {
    const approval = db.getPayrollApproval(approvalId);
    if (!approval || approval.approver_id !== approverId) {
      return { ok: false, reason: 'Approval not found or unauthorized' };
    }
    if (approval.status !== 'pending') {
      return { ok: false, reason: 'Already processed' };
    }
    db.updatePayrollApprovalStatus(approvalId, 'approved');
    db.updatePayrollBatchStatus(approval.batch_id, 'approved');
    return { ok: true, batchId: approval.batch_id };
  }

  reject(approvalId, approverId) {
    const approval = db.getPayrollApproval(approvalId);
    if (!approval || approval.approver_id !== approverId) {
      return { ok: false, reason: 'Approval not found or unauthorized' };
    }
    db.updatePayrollApprovalStatus(approvalId, 'rejected');
    db.updatePayrollBatchStatus(approval.batch_id, 'rejected');
    return { ok: true, batchId: approval.batch_id };
  }

  getPendingForApprover(approverId) {
    return db.getPendingApprovalsForApprover(approverId);
  }

  formatApprovalRequest(approval, batch) {
    return (
      `✋ Payroll Approval Required\n\n` +
      `Batch: ${batch.batch_id}\n` +
      `Total: ${batch.total_amount} ${batch.currency}\n` +
      `Staff: ${batch.line_count}\n\n` +
      `Reply "approve ${approval.approval_id}" or "reject ${approval.approval_id}"`
    );
  }
}

module.exports = new ApprovalService();
