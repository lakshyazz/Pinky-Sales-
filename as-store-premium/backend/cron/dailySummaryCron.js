import cron from 'node-cron';
import { sendDailyInwardStockReport, generateAndSendDailyReport, getTodayDateIST } from '../services/email/emailService.js';

/**
 * Initializes in-process cron jobs for automated reports in Asia/Kolkata (IST) timezone.
 */
export function initScheduledEmailCrons() {
  const isEnabled = process.env.ENABLE_SCHEDULED_CRONS !== 'false';
  if (!isEnabled) {
    console.log('[CronScheduler] In-process crons disabled via ENABLE_SCHEDULED_CRONS=false.');
    return;
  }

  // 1. Scheduled Daily Stocks & Products Report with Excel Attachment at 10:00 PM (22:00) IST
  // Cron: '0 22 * * *' (Minute 0, Hour 22 every day)
  cron.schedule(
    '0 22 * * *',
    async () => {
      console.log('[CronScheduler] ⏰ Running 10:00 PM IST Scheduled Stocks & Products Report...');
      try {
        const today = getTodayDateIST();
        const res = await sendDailyInwardStockReport({ targetDate: today });
        console.log(`[CronScheduler] 10:00 PM Stocks & Products Report finished (Rows: ${res.rowsCount}, Success: ${res.success})`);
      } catch (err) {
        console.error('[CronScheduler] Failed 10:00 PM Stocks & Products Report:', err.message);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  // 2. Scheduled End-of-Day Daily Performance Summary at 11:59 PM (23:59) IST
  // Cron: '59 23 * * *'
  cron.schedule(
    '59 23 * * *',
    async () => {
      console.log('[CronScheduler] ⏰ Running 11:59 PM IST End-of-Day Store Summary...');
      try {
        const today = getTodayDateIST();
        const res = await generateAndSendDailyReport({ targetDate: today });
        console.log(`[CronScheduler] End-of-Day Summary finished (Success: ${res.success})`);
      } catch (err) {
        console.error('[CronScheduler] Failed End-of-Day Summary:', err.message);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  console.log('[CronScheduler] ✅ Scheduled Email Crons initialized: 9:00 PM Inward Report & 11:59 PM EOD Summary (Asia/Kolkata).');
}
