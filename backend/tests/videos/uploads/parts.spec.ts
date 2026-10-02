import { validateParts } from 'src/videos/uploads/uploads.service';
import { VideoUpload } from 'src/videos/uploads/upload.entity';

describe('multipart integrity', () => {
  const s = {
    size: '11',
    partSize: 8,
    checksumMode: 'sha256',
    checksums: { 1: 'a', 2: 'b' },
  } as unknown as VideoUpload;
  const parts = [
    { PartNumber: 1, Size: 8, ETag: 'opaque1', ChecksumSHA256: 'a' },
    { PartNumber: 2, Size: 3, ETag: 'opaque2', ChecksumSHA256: 'b' },
  ];
  it('accepts exact parts without assuming that ETags are MD5', () =>
    expect(() => validateParts(s, parts)).not.toThrow());
  it.each(
    [
      parts.slice(0, 1),
      [parts[0], parts[0]],
      [parts[1], parts[0]],
      [parts[0], { ...parts[1], Size: 4 }],
      [parts[0], { ...parts[1], ChecksumSHA256: 'tampered' }],
    ].map((parts) => [parts]),
  )(
    'rejects missing, duplicated, unordered, oversized or corrupt parts: %j',
    (candidate) => {
      expect(() => validateParts(s, candidate as any)).toThrow();
    },
  );
});
