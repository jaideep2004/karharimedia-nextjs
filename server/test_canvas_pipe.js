const { createCanvas } = require('@napi-rs/canvas');
const { spawn } = require('child_process');
const path = require('path');

const testDir = 'C:\\Users\\jaisi\\AppData\\Local\\Temp\\opencode';
const ffmpegPath = 'C:/Users/jaisi/Downloads/images/ffmpeg-2025-07-17-git-bc8d06d541-essentials_build/bin/ffmpeg.exe';
const outPath = path.join(testDir, 'canvas_final_test.mp4');
const logPath = path.join(testDir, 'canvas_final_stderr.txt');

const S = 200, CX = S/2, CY = S/2, R = 74;
const fps = 25, totalFrames = 25;

const canvas = createCanvas(S, S);
const ctx = canvas.getContext('2d');

const stderrChunks = [];

const encoder = spawn(ffmpegPath, [
  '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', S + 'x' + S, '-r', String(fps),
  '-i', '-',
  '-frames:v', String(totalFrames),
  '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
  '-pix_fmt', 'yuv420p',
  outPath
], { stdio: ['pipe', 'pipe', 'pipe'] });

encoder.stderr.on('data', d => stderrChunks.push(d));

encoder.on('close', code => {
  require('fs').writeFileSync(logPath, stderrChunks.join(''));
  console.log('Exit code:', code);
  if (code === 0) {
    const size = require('fs').statSync(outPath).size;
    console.log('File size:', size, 'bytes');
    console.log('SUCCESS!');
  } else {
    console.log('FAILED. See log:', logPath);
  }
});

let frame = 0;
function render() {
  ctx.clearRect(0, 0, S, S);
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2 - Math.PI / 2;
    const amp = 30 + Math.sin(frame * 0.5 + i * 0.3) * 15;
    ctx.moveTo(CX + Math.cos(a) * R, CY + Math.sin(a) * R);
    ctx.lineTo(CX + Math.cos(a) * (R - amp), CY + Math.sin(a) * (R - amp));
  }
  ctx.stroke();

  const imgData = ctx.getImageData(0, 0, S, S);
  const buf = Buffer.from(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength);
  const ok = encoder.stdin.write(buf);
  frame++;
  if (frame < totalFrames) setImmediate(render);
  else encoder.stdin.end();
}

console.log('Starting frame generation...');
render();
