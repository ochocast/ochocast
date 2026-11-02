import {
  Attributes,
  context,
  metrics,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';

// Business instrumentation on top of the automatic HTTP, PostgreSQL and S3 spans.
// Without an OpenTelemetry SDK registered (tests, local dev without a
// collector) every call below is a no-op.
export const tracer = trace.getTracer('ochocast-backend');
export const meter = metrics.getMeter('ochocast-backend');

// Adds domain attributes (upload.id, recording.room_id...) to the span the
// current request runs in, so traces can be searched by business identifiers.
export function annotate(attributes: Attributes): void {
  trace.getActiveSpan()?.setAttributes(attributes);
}

// Runs `fn` in a child span named after a business operation. A thrown error
// marks the span as failed and is rethrown unchanged.
export function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
      throw error;
    } finally {
      span.end();
    }
  });
}

// Runs `fn` without creating spans: for the queries behind metric gauges, which
// would otherwise produce an orphan trace at every export.
export function untraced<T>(fn: () => Promise<T>): Promise<T> {
  return context.with(suppressTracing(context.active()), fn);
}
