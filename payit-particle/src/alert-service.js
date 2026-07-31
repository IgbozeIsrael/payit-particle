const particleService = require('./particle-service');
const notificationService = require('./notification-service');

class AlertService {
  async checkLowBalance(user) {
    const threshold = user.low_balance_threshold;
    if (!threshold || threshold <= 0) {
      return null;
    }

    let balance = 150;
    if (!particleService.isSimulationMode() && user.owner_address) {
      try {
        const unified = await particleService.getUnifiedBalance(user.owner_address);
        balance = parseFloat(unified.totalAmountInUSD) || 0;
      } catch (_) {
        balance = 150;
      }
    }

    if (balance < threshold) {
      return {
        telegramId: user.telegram_id,
        balance,
        threshold,
        message:
          `⚠️ Low Balance Alert\n\n` +
          `Your balance ($${balance.toFixed(2)}) is below your alert threshold ($${threshold.toFixed(2)}).\n` +
          `Top up your wallet or reduce outgoing payments.`
      };
    }
    return null;
  }

  async runLowBalanceChecks(db) {
    const users = db.getUsersWithLowBalanceThreshold();
    const alerts = [];
    for (const user of users) {
      const alert = await this.checkLowBalance(user);
      if (alert) {
        alerts.push(alert);
        notificationService.notify(user.telegram_id, alert.message);
      }
    }
    return alerts;
  }
}

module.exports = new AlertService();
