import { generateVideo } from './src/services/videoGeneration.service';
import path from 'path';
import fs from 'fs/promises';

const testDir = 'C:\\Users\\jaisi\\AppData\\Local\\Temp\\opencode';

async function main() {
  const audioPath = path.join(testDir, 'circular_test_audio.mp3');
  const artworkPath = path.join(testDir, 'test_artwork.png');
  const outputPath = path.join(testDir, 'circular_with_artwork.mp4');

  await Promise.all([
    fs.stat(audioPath).catch(() => { throw new Error('Missing test audio'); }),
    fs.stat(artworkPath).catch(() => { throw new Error('Missing test artwork'); }),
  ]);

  console.log('Generating circular video WITH artwork...');
  const start = Date.now();

  const result = await generateVideo({
    audioPath,
    artworkPath,
    title: 'Test with Artwork',
    artist: 'Canvas Visualizer',
    preset: 'circular',
    outputPath,
    hasArtwork: true,
    onProgress: (pct) => console.log(`  Progress: ${pct.toFixed(1)}%`),
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s | ${(result.duration / parseFloat(elapsed)).toFixed(2)}x`);
  console.log(`Output: ${result.outputPath} (${(result.fileSize / 1024 / 1024).toFixed(2)} MB)`);

  const stat = await fs.stat(result.outputPath).catch(() => null);
  console.log(stat && stat.size > 0 ? 'SUCCESS' : 'FAILED');
}

main().catch(err => { console.error('Test failed:', err.message); process.exit(1); });