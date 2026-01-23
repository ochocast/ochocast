import { CreateVideoDto } from '../../infra/controllers/dto/create-video.dto';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { Upload } from '@aws-sdk/lib-storage';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import * as sharp from 'sharp';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export class CreateNewVideoUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(
    videoToCreate: CreateVideoDto,
    file: Express.Multer.File,
    miniatureFile: Express.Multer.File,
    subtitleFile?: Express.Multer.File,
  ): Promise<VideoObject> {
    const baseName = path.parse(videoToCreate.media_id).name;
    const media_id = Date.now() + '.' + baseName + '.mp4';
    const miniature_id = `miniature${Date.now()}.jpg`;
    let subtitle_id: string | undefined;

    // We'll generate subtitle_id after conversion in the upload section

    const video = new VideoObject(
      uuid(),
      media_id,
      miniature_id,
      videoToCreate.title,
      videoToCreate.description,
      videoToCreate.tags,
      videoToCreate.creator,
      new Date(Date.now()),
      new Date(Date.now()),
      videoToCreate.internal_speakers,
      videoToCreate.external_speakers,
      0,
      [new CommentEntity(null)],
      false,
      subtitle_id,
    );
    const tempInputPath = path.join(tmpdir(), `${video.media_id}-input`);
    const tempOutputPath = path.join(
      tmpdir(),
      `${video.media_id}-transcoded.mp4`,
    );
    await writeFile(tempInputPath, file.buffer);

    // Extract video duration before transcoding
    const videoDuration = await getVideoDuration(tempInputPath);
    video.duration = videoDuration;

    await transcodeVideo(tempInputPath, tempOutputPath);

    const transcodedBuffer = await readFile(tempOutputPath);

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: process.env.STOCK_MEDIA_BUCKET,
        Key: video.media_id,
        Body: transcodedBuffer,
        ContentType: 'video/mp4',
        ContentDisposition: 'inline',
        CacheControl: 'max-age=31536000',
      },
    });

    const video_result = await upload.done();

    const tempMiniaturePath = path.join(
      tmpdir(),
      `miniature${video.media_id}.jpg`,
    );

    if (miniatureFile) {
      await sharp(miniatureFile.buffer)
        .resize(1280, 720, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 80 })
        .toFile(tempMiniaturePath);
    } else {
      await generateThumbnailFromVideo(tempOutputPath, tempMiniaturePath);
    }

    // Upload subtitle file if provided
    if (subtitleFile) {
      // Validate subtitle file format
      const allowedExtensions = ['.srt', '.vtt'];
      const subtitleExtension = path
        .extname(subtitleFile.originalname)
        .toLowerCase();

      if (!allowedExtensions.includes(subtitleExtension)) {
        throw new Error(
          `Invalid subtitle format. Allowed formats: ${allowedExtensions.join(', ')}`,
        );
      }

      // Validate UTF-8 encoding and convert SRT to VTT if needed
      let subtitleContent: Buffer;
      try {
        const decoded = subtitleFile.buffer.toString('utf-8');
        // If the file is .srt, convert to WebVTT since browsers require VTT for <track>
        if (subtitleExtension === '.srt') {
          console.log('Converting SRT to VTT format...');
          const converted = convertSrtToVtt(decoded);
          subtitleContent = Buffer.from(converted, 'utf-8');
          subtitle_id = `subtitle${Date.now()}.vtt`;
        } else {
          // .vtt already - but ensure it has WEBVTT header
          const normalized = decoded.trim();
          if (!normalized.startsWith('WEBVTT')) {
            console.log('Adding WEBVTT header to VTT file...');
            subtitleContent = Buffer.from('WEBVTT\n\n' + normalized, 'utf-8');
          } else {
            subtitleContent = Buffer.from(normalized, 'utf-8');
          }
          subtitle_id = `subtitle${Date.now()}.vtt`;
        }
      } catch (error) {
        throw new Error('Subtitle file must be encoded in UTF-8');
      }

      const subtitleUpload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: process.env.STOCK_MEDIA_BUCKET,
          Key: subtitle_id,
          Body: subtitleContent,
          ContentType: 'text/vtt',
          ContentDisposition: 'inline',
          CacheControl: 'max-age=31536000',
        },
      });
      await subtitleUpload.done();

      // Attach generated subtitle_id to the VideoObject
      if (subtitle_id) {
        video.subtitle_id = subtitle_id;
      }
      console.log(`✅ Subtitle uploaded: ${subtitle_id}`);
    }
    const miniatureUpload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: process.env.STOCK_MINIATURE_BUCKET,
        Key: video.miniature_id,
        Body: await readFile(tempMiniaturePath),
        ContentType: 'image/jpeg',
      },
    });
    const miniature_result = await miniatureUpload.done();
    await unlink(tempMiniaturePath).catch(() => {});

    await unlink(tempInputPath).catch(() => {});
    await unlink(tempOutputPath).catch(() => {});

    await this.videoGateway.createNewVideo(video);
    return video;
  }
}

async function transcodeVideo(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .videoCodec('libx264')
      .outputOptions(['-preset fast', '-crf 23', '-movflags +faststart'])
      .format('mp4')
      .output(outputPath)
      .on('end', () => {
        resolve();
      })
      .on('error', (err) => {
        reject(err);
      });
    command.run();
  });
}

async function getVideoDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const duration = metadata.format.duration || 0;
        resolve(duration);
      }
    });
  });
}

/**
 * Simple SRT -> WebVTT converter.
 * - ensures the file starts with WEBVTT header
 * - replaces comma decimals in timecodes with dots
 * - preserves other lines
 */
function convertSrtToVtt(srt: string): string {
  // normalize CRLF
  const normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // replace timestamps like 00:00:01,500 --> 00:00:03,000 to use dot decimals
  const convertedTimestamps = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2',
  );
  // Prepend WEBVTT header if not present
  if (!/^WEBVTT/m.test(convertedTimestamps)) {
    return 'WEBVTT\n\n' + convertedTimestamps.trim() + '\n';
  }
  return convertedTimestamps;
}

async function generateThumbnailFromVideo(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: ['0'],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '1280x720',
      })
      .on('end', () => {
        resolve();
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}
