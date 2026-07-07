import { Db } from 'mongodb';

export function auditLogsCollection(db: Db) {
  return db.collection('auditlogs');
}

export async function logDbMigrationAudit(
  db: Db,
  event: string,
  details: Record<string, unknown>
) {
  await auditLogsCollection(db).insertOne({
    event,
    details,
    createdAt: new Date(),
  });
}
