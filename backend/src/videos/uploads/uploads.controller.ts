import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
import { UploadsService } from './uploads.service';
@Controller('video-uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}
  @Post() create(
    @CurrentUserEmail() email: string,
    @Body() body: { filename: string; size: number },
  ) {
    return this.uploads.create(email, body);
  }
  @Get(':id') status(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ) {
    return this.uploads.status(id, email);
  }
  @Post(':id/parts/:number') sign(
    @Param('id') id: string,
    @Param('number') number: string,
    @CurrentUserEmail() email: string,
    @Body() body: { checksum: string },
  ) {
    return this.uploads.sign(id, email, Number(number), body.checksum);
  }
  @Post(':id/complete')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'miniature', maxCount: 1 },
        { name: 'subtitle', maxCount: 1 },
      ],
      {
        limits: {
          fileSize: 5 * 1024 ** 2,
          files: 2,
          fields: 15,
          fieldSize: 64 * 1024,
          parts: 17,
        },
      },
    ),
  )
  complete(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
    @Body() body: Record<string, any>,
    @UploadedFiles() files: Record<string, Express.Multer.File[]>,
  ) {
    return this.uploads.complete(
      id,
      email,
      body,
      Object.values(files || {}).flat(),
    );
  }
  @Delete(':id') cancel(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ) {
    return this.uploads.cancel(id, email);
  }
}
