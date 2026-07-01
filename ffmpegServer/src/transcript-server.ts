import 'dotenv/config';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createS3Client, S3_CONFIG } from './config/s3.config';

type MultipartFile = {
  fieldName: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
};

type MultipartForm = {
  fields: Record<string, string | string[]>;
  files: MultipartFile[];
};

type AudioRequestInput = {
  fields: Record<string, string | string[]>;
  filename: string;
  buffer: Buffer;
  defaultResponseFormat: string;
};

type Segment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type TranscriptionResult = {
  text: string;
  language?: string;
  duration?: number;
  segments?: Segment[];
};

const port = Number.parseInt(process.env.TRANSCRIPT_PORT || '8080', 10);
const maxUploadBytes = Number.parseInt(
  process.env.TRANSCRIPT_MAX_UPLOAD_BYTES || `${100 * 1024 * 1024}`,
  10,
);
const transcriptApiKey = process.env.TRANSCRIPT_API_KEY;
const s3Client = createS3Client();

function setCors(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization,Content-Type',
  );
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  setCors(response);
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  body: string,
  contentType = 'text/plain; charset=utf-8',
): void {
  setCors(response);
  response.writeHead(statusCode, { 'Content-Type': contentType });
  response.end(body);
}

function unauthorized(response: ServerResponse): void {
  sendJson(response, 401, {
    error: {
      message: 'Invalid or missing bearer token',
      type: 'invalid_request_error',
    },
  });
}

function isAuthorized(request: IncomingMessage): boolean {
  if (!transcriptApiKey) return true;
  return request.headers.authorization === `Bearer ${transcriptApiKey}`;
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    request.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxUploadBytes) {
        reject(new Error('Uploaded file is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function jsonToFields(value: unknown): Record<string, string | string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const fields: Record<string, string | string[]> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue === null || rawValue === undefined) continue;
    if (Array.isArray(rawValue)) {
      fields[key] = rawValue.map((entry) => String(entry));
    } else {
      fields[key] = String(rawValue);
    }
  }
  return fields;
}

function parseContentDisposition(
  header: string,
): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey || rawValue.length === 0) continue;
    values[rawKey] = rawValue.join('=').replace(/^"|"$/g, '');
  }
  return values;
}

function addField(
  fields: Record<string, string | string[]>,
  name: string,
  value: string,
): void {
  const existing = fields[name];
  if (Array.isArray(existing)) {
    existing.push(value);
  } else if (typeof existing === 'string') {
    fields[name] = [existing, value];
  } else {
    fields[name] = value;
  }
}

function parseMultipartForm(contentType: string, body: Buffer): MultipartForm {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) {
    throw new Error('Missing multipart boundary');
  }

  const delimiter = Buffer.from(`--${boundary}`);
  const fields: Record<string, string | string[]> = {};
  const files: MultipartFile[] = [];
  let cursor = body.indexOf(delimiter);

  while (cursor !== -1) {
    const partStart = cursor + delimiter.length;
    if (body.subarray(partStart, partStart + 2).toString() === '--') break;

    let contentStart = partStart;
    if (body.subarray(contentStart, contentStart + 2).toString() === '\r\n') {
      contentStart += 2;
    }

    const nextDelimiter = body.indexOf(delimiter, contentStart);
    if (nextDelimiter === -1) break;

    let partEnd = nextDelimiter;
    if (body.subarray(partEnd - 2, partEnd).toString() === '\r\n') {
      partEnd -= 2;
    }

    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), contentStart);
    if (headerEnd !== -1 && headerEnd < partEnd) {
      const rawHeaders = body.subarray(contentStart, headerEnd).toString();
      const content = body.subarray(headerEnd + 4, partEnd);
      const headers = Object.fromEntries(
        rawHeaders.split('\r\n').map((line) => {
          const separator = line.indexOf(':');
          return [
            line.slice(0, separator).trim().toLowerCase(),
            line.slice(separator + 1).trim(),
          ];
        }),
      );

      const disposition = parseContentDisposition(
        headers['content-disposition'] || '',
      );
      const name = disposition.name;
      if (name && disposition.filename) {
        files.push({
          fieldName: name,
          filename: disposition.filename,
          contentType: headers['content-type'] || 'application/octet-stream',
          buffer: content,
        });
      } else if (name) {
        addField(fields, name, content.toString('utf8'));
      }
    }

    cursor = nextDelimiter;
  }

  return { fields, files };
}

function firstField(
  fields: Record<string, string | string[]>,
  name: string,
): string | undefined {
  const value = fields[name];
  return Array.isArray(value) ? value[0] : value;
}

function audioKeyFromFields(
  fields: Record<string, string | string[]>,
): string | undefined {
  return (
    firstField(fields, 'audio_id') ||
    firstField(fields, 'audioId') ||
    firstField(fields, 'key') ||
    firstField(fields, 's3_key') ||
    firstField(fields, 's3Key')
  );
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  if (
    stream &&
    typeof (stream as { transformToByteArray?: unknown })
      .transformToByteArray === 'function'
  ) {
    const bytes = await (
      stream as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }

  if (!stream || typeof (stream as NodeJS.ReadableStream).on !== 'function') {
    throw new Error('S3 response did not contain a readable body');
  }

  const readable = stream as NodeJS.ReadableStream;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readable.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    readable.on('error', reject);
    readable.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function downloadAudioFromS3(
  fields: Record<string, string | string[]>,
): Promise<{ buffer: Buffer; key: string }> {
  const key = audioKeyFromFields(fields);
  if (!key) {
    throw new Error(
      'Missing S3 audio key. Provide audio_id, audioId, key or s3_key.',
    );
  }

  const bucket =
    firstField(fields, 'bucket') ||
    firstField(fields, 's3_bucket') ||
    S3_CONFIG.mediaBucket;
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  return {
    key,
    buffer: await streamToBuffer(response.Body),
  };
}

function scriptPath(): string {
  if (process.env.TRANSCRIPT_SCRIPT_PATH) {
    return process.env.TRANSCRIPT_SCRIPT_PATH;
  }

  const distPath = path.join(__dirname, 'transcript', 'transcribe.py');
  if (existsSync(distPath)) {
    return distPath;
  }

  return path.join(process.cwd(), 'src', 'transcript', 'transcribe.py');
}

function runTranscription(
  filePath: string,
  fields: Record<string, string | string[]>,
  task: 'transcribe' | 'translate',
): Promise<TranscriptionResult> {
  const args = [
    scriptPath(),
    '--file',
    filePath,
    '--task',
    task,
    '--model',
    firstField(fields, 'model') || 'whisper-1',
  ];

  const language = firstField(fields, 'language');
  const prompt = firstField(fields, 'prompt');
  if (language) args.push('--language', language);
  if (prompt) args.push('--prompt', prompt);

  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BIN || 'python3', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Transcription exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as TranscriptionResult);
      } catch (error) {
        reject(
          new Error(
            `Unable to parse transcription output: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  });
}

function formatTimestamp(seconds: number, separator: ',' | '.'): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours.toString().padStart(2, '0')}:${mins
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}${separator}${ms
    .toString()
    .padStart(3, '0')}`;
}

function toSrt(result: TranscriptionResult): string {
  const segments = result.segments?.length
    ? result.segments
    : [{ id: 0, start: 0, end: result.duration || 0, text: result.text }];
  return segments
    .map(
      (segment, index) =>
        `${index + 1}\n${formatTimestamp(segment.start, ',')} --> ${formatTimestamp(
          segment.end,
          ',',
        )}\n${segment.text.trim()}\n`,
    )
    .join('\n');
}

function toVtt(result: TranscriptionResult): string {
  const segments = result.segments?.length
    ? result.segments
    : [{ id: 0, start: 0, end: result.duration || 0, text: result.text }];
  return `WEBVTT\n\n${segments
    .map(
      (segment) =>
        `${formatTimestamp(segment.start, '.')} --> ${formatTimestamp(
          segment.end,
          '.',
        )}\n${segment.text.trim()}\n`,
    )
    .join('\n')}`;
}

function sendTranscriptionResponse(
  response: ServerResponse,
  result: TranscriptionResult,
  responseFormat: string,
  task: 'transcribe' | 'translate',
): void {
  if (responseFormat === 'text') {
    sendText(response, 200, result.text);
  } else if (responseFormat === 'srt') {
    sendText(response, 200, toSrt(result), 'application/x-subrip');
  } else if (responseFormat === 'vtt') {
    sendText(response, 200, toVtt(result), 'text/vtt; charset=utf-8');
  } else if (responseFormat === 'verbose_json') {
    sendJson(response, 200, {
      task,
      language: result.language,
      duration: result.duration,
      text: result.text,
      segments: result.segments || [],
    });
  } else {
    sendJson(response, 200, { text: result.text });
  }
}

async function resolveAudioInput(
  contentType: string,
  body: Buffer,
): Promise<AudioRequestInput> {
  if (contentType.includes('multipart/form-data')) {
    const form = parseMultipartForm(contentType, body);
    const file = form.files.find((entry) => entry.fieldName === 'file');
    if (file) {
      return {
        fields: form.fields,
        filename: file.filename || 'audio',
        buffer: file.buffer,
        defaultResponseFormat: 'json',
      };
    }

    const audio = await downloadAudioFromS3(form.fields);
    return {
      fields: form.fields,
      filename: path.basename(audio.key) || 'audio.wav',
      buffer: audio.buffer,
      defaultResponseFormat: 'vtt',
    };
  }

  if (contentType.includes('application/json')) {
    const fields = jsonToFields(JSON.parse(body.toString('utf8') || '{}'));
    const audio = await downloadAudioFromS3(fields);
    return {
      fields,
      filename: path.basename(audio.key) || 'audio.wav',
      buffer: audio.buffer,
      defaultResponseFormat: 'vtt',
    };
  }

  throw new Error(
    'Expected multipart/form-data with file or application/json with audio_id/key',
  );
}

async function handleAudioRequest(
  request: IncomingMessage,
  response: ServerResponse,
  task: 'transcribe' | 'translate',
): Promise<void> {
  if (!isAuthorized(request)) {
    unauthorized(response);
    return;
  }

  const contentType = request.headers['content-type'] || '';
  const body = await readRequestBody(request);
  let audioInput: AudioRequestInput;
  try {
    audioInput = await resolveAudioInput(contentType, body);
  } catch (error) {
    sendJson(response, 400, {
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: 'invalid_request_error',
      },
    });
    return;
  }

  const tempDir = path.join(tmpdir(), `transcript-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, audioInput.filename);

  try {
    await writeFile(inputPath, audioInput.buffer);
    const result = await runTranscription(inputPath, audioInput.fields, task);
    const responseFormat =
      firstField(audioInput.fields, 'response_format') ||
      audioInput.defaultResponseFormat;
    sendTranscriptionResponse(response, result, responseFormat, task);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const server = createServer((request, response) => {
  void (async () => {
    setCors(response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/models') {
      sendJson(response, 200, {
        object: 'list',
        data: [{ id: 'whisper-1', object: 'model', owned_by: 'local' }],
      });
      return;
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/v1/audio/transcriptions'
    ) {
      await handleAudioRequest(request, response, 'transcribe');
      return;
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/v1/audio/translations'
    ) {
      await handleAudioRequest(request, response, 'translate');
      return;
    }

    sendJson(response, 404, {
      error: { message: 'Route not found', type: 'invalid_request_error' },
    });
  })().catch((error: unknown) => {
    console.error('Transcript request failed:', error);
    sendJson(response, 500, {
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: 'server_error',
      },
    });
  });
});

server.on('error', (error) => {
  console.error('Unable to start Transcript API:', error);
  process.exit(1);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Transcript API listening on port ${port}`);
});
