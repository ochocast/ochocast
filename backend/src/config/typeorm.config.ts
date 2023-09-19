import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';

config();

const configService = new ConfigService();

export default new DataSource({
  type: 'postgres',
  host: configService.get('PG_HOST'),
  port: configService.get('PG_PORT'),
  username: configService.get('PG_USERNAME'),
  password: configService.get('PG_PASSWORD'),
  database: configService.get('PG_DATABASE'),
  entities: [`${__dirname}/../**/*.entity.{js,ts}`],
  synchronize: configService.get('nodenv') === 'development',
  logging: configService.get('nodenv') === 'development',
  migrations: [`${__dirname}/../migrations/*{.ts,.js}`],
  migrationsTableName: 'migrations',
});
