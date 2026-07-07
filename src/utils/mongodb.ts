import * as dotenv from 'dotenv';
import { MongoClient, Db } from 'mongodb';
import path from 'path';

// Load env from server/.env if not already loaded
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

const options = {};

let clientPromise: Promise<MongoClient> | null = null;

const getMongoClientPromise = (): Promise<MongoClient> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  if (clientPromise) {
    return clientPromise;
  }

  if (process.env.NODE_ENV === 'development') {
    const globalWithMongo = globalThis as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>;
    };

    if (!globalWithMongo._mongoClientPromise) {
      const client = new MongoClient(uri, options);
      globalWithMongo._mongoClientPromise = client.connect();
    }

    clientPromise = globalWithMongo._mongoClientPromise;
    return clientPromise;
  }

  const client = new MongoClient(uri, options);
  clientPromise = client.connect();
  return clientPromise;
};

export async function connectToDatabase(): Promise<{ db: Db; client: MongoClient }> {
  const client = await getMongoClientPromise();
  const db = client.db();
  return { db, client };
}
