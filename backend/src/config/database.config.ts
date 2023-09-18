import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT, 10),
  username: process.env.PG_USERNAME,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  migrations: [`${__dirname}/../../../database/migrations/*{.ts,.js}`],
  migrationsTableName: 'migrations',
}));
