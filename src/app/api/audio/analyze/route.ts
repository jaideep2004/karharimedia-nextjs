import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdir, unlink } from 'fs/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { getBackendBaseUrl } from '@/app/api/_lib/backend';

const API_URL = getBackendBaseUrl();
const UPLOAD_DIR = join(process.cwd(), 'uploads');

async function saveFileToDisk(file: File) {   
  await mkdir(UPLOAD_DIR, { recursive: true });
  const fileName = `${randomUUID()}-${file.name}`;
  const filePath = join(UPLOAD_DIR, fileName);
  
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  
  const writeStream = createWriteStream(filePath);
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null); // Signal end of stream
  
  await new Promise<void>((resolve, reject) => {
    const stream = readable.pipe(writeStream);
    stream.on('finish', () => resolve());
    stream.on('error', (error) => reject(error));
  });
  
  return { filePath, fileName };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Save file to disk first
    const { filePath } = await saveFileToDisk(file);
    
    try {
      // Create a new FormData instance for the Express server
      const expressFormData = new FormData();
      expressFormData.append('file', new Blob([await file.arrayBuffer()]), file.name);
      
      const response = await fetch(`${API_URL}/api/audio/analyze`, {
        method: 'POST',
        body: expressFormData,
        // No need for headers, the browser will set the correct Content-Type with boundary
      });

      if (!response.ok) {
        // Try to forward the exact error back to the client
        let errorBody: any = null;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { error: await response.text() };
        }
        console.error('Error from Express server:', errorBody);
        return NextResponse.json(errorBody, { status: response.status });
      }

      const data = await response.json();
      return NextResponse.json(data);
    } finally {
      // Clean up the temporary file
      try {
        await unlink(filePath);
      } catch (cleanupError) {
        console.error('Error cleaning up temporary file:', cleanupError);
      }
    }
  } catch (error) {
    console.error('Error analyzing audio:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
