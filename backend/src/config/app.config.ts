import { registerAs } from '@nestjs/config';

export default registerAs('config', () => ({
  port: process.env.PORT || 8000,
  nodenv: process.env.NODE_ENV || 'development',
}));
