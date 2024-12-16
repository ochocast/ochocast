'use strict';
Object.defineProperty(exports, '__esModule', { value: true });

import * as pino_1 from 'pino';
const logger = (0, pino_1.default)({
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
  level: 'info',
});

export default logger;
