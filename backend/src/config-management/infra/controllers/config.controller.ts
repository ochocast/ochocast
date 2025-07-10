import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Delete,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CurrentUserEmail } from '../../../common/decorators/current-user-email.decorator';
import { AddConfigFileUsecase } from '../../domain/usecases/addConfigFile.usecase';
import { GetConfigFileUrlUsecase } from '../../domain/usecases/getConfigFileUrl.usecase';
import { ResetConfigUsecase } from '../../domain/usecases/resetConfig.usecase';
import { ConfigObject } from '../../domain/config';

@ApiTags('Config Management')
@Controller('config')
export class ConfigController {
  constructor(
    private addConfigFileUsecase: AddConfigFileUsecase,
    private getConfigFileUrlUsecase: GetConfigFileUrlUsecase,
    private resetConfigUsecase: ResetConfigUsecase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Upload a new config file (Admin only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new ValidationPipe())
  async uploadConfigFile(
    @CurrentUserEmail() currentUserEmail: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ConfigObject> {
    try {
      return await this.addConfigFileUsecase.execute(currentUserEmail, file);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to upload config file',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

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

  @Delete('reset')
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
}
