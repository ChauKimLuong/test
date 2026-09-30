import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'postgres://flowpilot:flowpilot_local_change_me@localhost:5433/flowpilot',
  },
});
