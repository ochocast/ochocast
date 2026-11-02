// OpenTelemetry bootstrap. Imported first in main.ts so the auto-instrumentations
// patch http, express, pg, pino and the AWS SDK before they are required.
//
// The backend only speaks OTLP. Where traces, metrics and logs end up is decided
// by the collector behind OTEL_EXPORTER_OTLP_ENDPOINT; every other setting comes
// from the standard OTEL_* variables (OTEL_SERVICE_NAME, OTEL_RESOURCE_ATTRIBUTES,
// OTEL_TRACES_SAMPLER, OTEL_METRIC_EXPORT_INTERVAL...).
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

// No collector configured (local dev without the stack, tests): stay a no-op.
if (
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
  process.env.OTEL_SDK_DISABLED !== 'true'
) {
  const sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        // Filesystem, DNS and raw socket spans drown the useful ones.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });
  sdk.start();

  // Flush buffered spans, metrics and logs when the process is stopped.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      sdk.shutdown().finally(() => process.exit(0));
    });
  }
}
