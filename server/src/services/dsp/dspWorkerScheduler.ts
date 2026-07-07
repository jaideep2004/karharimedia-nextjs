import { dspDeliveryService } from './dspDelivery.service';

const isEnabled = () =>
  String(process.env.ENABLE_DSP_WORKER_SCHEDULER || '').toLowerCase() === 'true';

const intervalMs = () => {
  const value = Number(process.env.DSP_WORKER_INTERVAL_MS || 60_000);
  return Number.isFinite(value) ? Math.max(15_000, value) : 60_000;
};

const maxJobs = () => {
  const value = Number(process.env.DSP_WORKER_MAX_JOBS || 5);
  return Number.isFinite(value) ? Math.min(50, Math.max(1, value)) : 5;
};

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await dspDeliveryService.processDueDeliveryJobs({
      maxJobs: maxJobs(),
      workerId: `server-scheduler:${process.pid}`,
    });
    if (result.processed.length > 0 || result.expiredLocksReleased > 0) {
      console.log('DSP worker scheduler processed due jobs', {
        processed: result.processed.length,
        expiredLocksReleased: result.expiredLocksReleased,
      });
    }
  } catch (error) {
    console.error('DSP worker scheduler failed:', error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

export function startDspWorkerScheduler() {
  if (!isEnabled()) {
    console.log('DSP worker scheduler disabled');
    return;
  }
  if (timer) return;

  const delay = intervalMs();
  timer = setInterval(() => {
    void tick();
  }, delay);
  timer.unref?.();
  void tick();
  console.log(`DSP worker scheduler enabled every ${delay}ms`);
}
