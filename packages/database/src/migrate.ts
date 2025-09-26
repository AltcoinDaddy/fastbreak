import { DatabaseManager } from './index';
import { config } from 'dotenv';

// Load environment variables
config();

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const db = new DatabaseManager(databaseUrl);

  try {
    console.log('Starting database migrations...');
    await db.initialize();
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}