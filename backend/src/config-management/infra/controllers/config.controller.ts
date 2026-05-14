import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Delete,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
  Param,
  Body,
} from '@nestjs/common';
import { FileInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Public } from 'nest-keycloak-connect';
import { CurrentUserEmail } from '../../../common/decorators/current-user-email.decorator';
import { AddConfigFileUsecase } from '../../domain/usecases/addConfigFile.usecase';
import { GetConfigFileUrlUsecase } from '../../domain/usecases/getConfigFileUrl.usecase';
import { ResetConfigUsecase } from '../../domain/usecases/resetConfig.usecase';
import { ConfigObject } from '../../domain/config';
import { UploadConfigFileDto } from './dto/upload-config-file.dto';
import { GetPictureUrlUsecase } from 'src/config-management/domain/usecases/getPictureUrlUsecase';

@ApiTags('Config Management')
@Controller('config')
export class ConfigController {
  constructor(
    private addConfigFileUsecase: AddConfigFileUsecase,
    private getConfigFileUrlUsecase: GetConfigFileUrlUsecase,
    private resetConfigUsecase: ResetConfigUsecase,
    private getPictureUrlUsecase: GetPictureUrlUsecase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Upload a new config file with images (Admin only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    type: UploadConfigFileDto,
  })
  @UseInterceptors(AnyFilesInterceptor())
  @UsePipes(new ValidationPipe())
  async uploadConfigFile(
    @CurrentUserEmail() currentUserEmail: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('imageIds') imageIds: string[],
  ): Promise<ConfigObject> {
    try {
      const uploadedFiles = files ?? [];

      // Séparer le fichier de config des images
      const configFile = uploadedFiles.find((f) => f.fieldname === 'file');
      const images = uploadedFiles.filter((f) => f.fieldname === 'images');

      if (!configFile) {
        throw new HttpException(
          'Config file is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      return await this.addConfigFileUsecase.execute(
        currentUserEmail,
        configFile,
        images,
        typeof imageIds == 'string' ? [imageIds] : imageIds,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to upload config file',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get the URL of the active config file (latest uploaded)',
  })
  async getActiveConfigFileUrl(): Promise<{ url: string }> {
    try {
      const url = await this.getConfigFileUrlUsecase.execute();
      return { url };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve config file URL',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('/reset')
  @ApiOperation({
    summary: 'Reset configuration (delete all config files) - Admin only',
  })
  async resetConfig(
    @CurrentUserEmail() currentUserEmail: string,
  ): Promise<{ message: string }> {
    try {
      return await this.resetConfigUsecase.execute(currentUserEmail);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to reset configuration',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Get('/picture/:key')
  @ApiOperation({
    summary: 'Get the URL of the active config file (latest uploaded)',
  })
  async getPictureUrl(@Param('key') key: string): Promise<{ url: string }> {
    try {
      const url = await this.getPictureUrlUsecase.execute(key);
      return { url };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve picture URL',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
