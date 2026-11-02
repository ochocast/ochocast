import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'http';

// Structured JSON logs: one object per line on stdout. The OpenTelemetry pino
// instrumentation adds trace_id/span_id and forwards each line over OTLP.
//
// Shared fields on every line: time, level, msg, context (Nest class), plus
// trace_id/span_id. Domain attributes are prefixed (upload.id, recording.room_id).
// Never log presigned URLs, tokens or request bodies.
export const loggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL || 'info',
    // pino-http logs one line per request; route and status also live on the span.
    customLogLevel: (_req, res: ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req: IncomingMessage, res: ServerResponse) =>
      `${req.method} ${res.statusCode}`,
    customErrorMessage: (req: IncomingMessage, res: ServerResponse) =>
      `${req.method} ${res.statusCode}`,
    // Keep only what helps: no headers (Authorization, cookies), no query
    // strings (they can carry signatures), no bodies.
    serializers: {
      req: (req) => ({ method: req.method, path: req.url?.split('?')[0] }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    autoLogging: {
      ignore: (req) => req.method === 'OPTIONS',
    },
  },
};
