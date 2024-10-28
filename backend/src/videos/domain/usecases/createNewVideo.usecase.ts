import { CreateVideoDto } from '../../infra/controllers/dto/create-video.dto';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";


export class CreateNewVideoUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('s3Client')
    private  s3Client: S3Client,
  ) {}

  async execute(videoToCreate: CreateVideoDto, file: Express.Multer.File): Promise<VideoObject> {
    console.log("AVANT CREATION DE VIDEO");
    const media_id = Date.now() + "." +  videoToCreate.media_id;
    const video = new VideoObject(
      uuid(),
      media_id,
      videoToCreate.title,
      videoToCreate.description,
      videoToCreate.tags,
      videoToCreate.creator,
      new Date(),
      new Date(),
      videoToCreate.internal_speakers,
      videoToCreate.external_speakers,
      0,
      [new CommentEntity(null)],
      false
    );
    console.log(video);
    console.log("AVANT UPLOAD")
    //Use S3 Client to push File in S3 Buckets
    const upload = new Upload({
      client: this.s3Client,
      params: {
          Bucket: process.env.STOCK_MEDIA_BUCKET,
          Key: video.media_id,
          Body: file.buffer,
          ContentType: file.mimetype
      }
    });
    console.log("AVANT DONE")

    // const what = 
    upload.done();
    //console.log("APRES DONE", what.toString())
    

    
    await this.videoGateway.createNewVideo(video);
    return video;
  }
}