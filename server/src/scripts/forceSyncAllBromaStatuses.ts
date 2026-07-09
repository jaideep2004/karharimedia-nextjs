import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { dspDeliveryService } from '../services/dsp/dspDelivery.service';
import DeliveryJob from '../models/deliveryJob.model';

dotenv.config();

const BATCH_SIZE = 200;
const MAX_BATCHES = 50;

const forceSyncAll = async () => {
  try {
    await connectDB();
    console.log('=== FORCE SYNC ALL BROMA RELEASES ===');
    console.log('');

    const totalJobs = await DeliveryJob.countDocuments({
      providerKey: 'broma',
      targetType: 'release',
      $or: [
        { externalId: { $exists: true, $ne: '' } },
        { 'metadata.bromaReleaseId': { $exists: true, $ne: '' } },
      ],
      'metadata.resetForApproval': { $ne: true },
      hiddenFromOps: { $ne: true },
      deadLettered: { $ne: true },
    });
    console.log(`Total Broma release delivery jobs: ${totalJobs}`);

    let totalChecked = 0;
    let totalApproved = 0;
    let totalRejected = 0;
    let totalProcessing = 0;
    let totalFailed = 0;
    let batch = 0;

    const requeueResult = await dspDeliveryService.requeueStuckBromaJobs({ maxJobs: 500, olderThanMinutes: 15 });
    console.log(`Re-queued ${requeueResult.requeued} stuck jobs`);
    console.log('');

    for (let skip = 0; skip < totalJobs && batch < MAX_BATCHES; skip += BATCH_SIZE, batch++) {
      console.log(`Batch ${batch + 1}: sync ${BATCH_SIZE} jobs (skip=${skip})...`);
      const result = await dspDeliveryService.syncBromaReleaseStatuses({ limit: BATCH_SIZE, skip });

      totalChecked += result.checked;
      totalApproved += result.approved;
      totalRejected += result.rejected;
      totalProcessing += result.stillProcessing;
      totalFailed += result.failed;

      console.log(`  Checked: ${result.checked}, Live: ${result.approved}, Rejected: ${result.rejected}, Processing: ${result.stillProcessing}, Failed: ${result.failed}`);

      if (result.failed > 0) {
        for (const r of result.results) {
          if (r.error) console.log(`  ERROR ${r.releaseId || r.jobId}: ${r.error}`);
        }
      }

      if (result.checked < BATCH_SIZE) break;
    }

    console.log('');
    console.log('=== FORCE SYNC COMPLETE ===');
    console.log(`  Total checked: ${totalChecked}`);
    console.log(`  Live:          ${totalApproved}`);
    console.log(`  Rejected:      ${totalRejected}`);
    console.log(`  Processing:    ${totalProcessing}`);
    console.log(`  Failed:        ${totalFailed}`);

    if (totalProcessing > 0) {
      console.log('');
      console.log(`NOTE: ${totalProcessing} releases still showing as processing.`);
      console.log('These will be polled again by the scheduler at the next interval.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Force sync failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

forceSyncAll();
