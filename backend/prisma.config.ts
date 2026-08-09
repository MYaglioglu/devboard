import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Die .env liegt im Wurzelverzeichnis des Repos - dieselbe, die auch Docker
// Compose und das ConfigModule lesen. Eine Quelle statt drei.
// Prisma laedt .env-Dateien seit Version 7 nicht mehr automatisch.
config({ path: '../.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
