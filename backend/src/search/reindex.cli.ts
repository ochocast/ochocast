import 'reflect-metadata';
import db from '../config/typeorm.config';
import { createS3Client } from '../s3.module';
import { TranscriptIndexer } from './infra/transcript-indexer';

// Run by hand (see docs/CONTENT_SEARCH.md); compiled to dist/search/reindex.cli.js
// for the production pods. Nothing else may import this file: it runs on load.
async function main() {
  const s3 = createS3Client();
  try {
    await db.initialize();
    const summary = await new TranscriptIndexer(db, s3).reindexAll();
    console.log(JSON.stringify(summary));
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    s3.destroy();
    if (db.isInitialized) await db.destroy();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
