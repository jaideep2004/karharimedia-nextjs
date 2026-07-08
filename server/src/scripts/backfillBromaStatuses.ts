import dotenv from 'dotenv';
import { connectDB } from '../config/db';
import { dspDeliveryService } from '../services/dsp/dspDelivery.service';

dotenv.config();
connectDB();

const backfill = async () => {
  try {
    console.log('Starting Broma status backfill...');
    console.log('This will re-sync all Broma delivery jobs.');

    const result = await dspDeliveryService.syncBromaReleaseStatuses({ limit: 300 });

    console.log('');
    console.log('Backfill complete:');
    console.log(`  Checked:    ${result.checked}`);
    console.log(`  Approved:   ${result.approved}`);
    console.log(`  Rejected:   ${result.rejected}`);
    console.log(`  Processing: ${result.stillProcessing}`);
    console.log(`  Failed:     ${result.failed}`);

    const errors = result.results.filter((r) => r.error);
    if (errors.length > 0) {
      console.log('');
      console.log('Errors:');
      for (const err of errors.slice(0, 10)) {
        console.log(`  ${err.releaseId || err.jobId}: ${err.error}`);
      }
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
};

backfill();
