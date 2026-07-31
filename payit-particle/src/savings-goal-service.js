const crypto = require('crypto');
const db = require('./db');

function progressBar(current, target, width = 10) {
  const pct = Math.min(1, current / target);
  const filled = Math.round(pct * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

class SavingsGoalService {
  create({ userId, title, targetAmount, currency, targetDate }) {
    const goalId = `goal_${crypto.randomUUID().slice(0, 8)}`;
    db.createSavingsGoal({
      goalId,
      userId,
      title,
      targetAmount,
      currentAmount: 0,
      currency: currency || 'USDC',
      targetDate,
      status: 'active'
    });
    return { goalId, title, targetAmount, currency, targetDate };
  }

  contribute(goalId, amount) {
    const goal = db.getSavingsGoal(goalId);
    if (!goal) return null;
    const newAmount = (goal.current_amount || 0) + amount;
    const status = newAmount >= goal.target_amount ? 'completed' : 'active';
    db.updateSavingsGoalProgress(goalId, newAmount, status);
    return { ...goal, current_amount: newAmount, status };
  }

  listActive(userId) {
    return db.getActiveSavingsGoals(userId);
  }

  formatGoal(goal) {
    const current = goal.current_amount || 0;
    const target = goal.target_amount;
    const pct = Math.min(100, Math.round((current / target) * 100));
    const bar = progressBar(current, target);
    const due = goal.target_date ? new Date(goal.target_date).toLocaleDateString() : 'No deadline';
    return (
      `🎯 ${goal.title}\n` +
      `${bar} ${pct}%\n` +
      `${current} / ${target} ${goal.currency} — due ${due}`
    );
  }

  formatGoalList(goals) {
    if (!goals.length) return 'No savings goals yet. Try: "Save 500000 NGN for rent by December"';
    return goals.map((g) => this.formatGoal(g)).join('\n\n');
  }
}

module.exports = new SavingsGoalService();
