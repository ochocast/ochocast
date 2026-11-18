import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
import { SearchResult, TranscriptResult } from '../../domain/search.types';
import { GetTranscriptUsecase } from '../../domain/usecases/get-transcript.usecase';
import { SearchVideosUsecase } from '../../domain/usecases/search-videos.usecase';
import { SearchQueryDto } from './search-query.dto';

@ApiTags('Search')
@Controller()
export class SearchController {
  constructor(
    private readonly searchVideosUsecase: SearchVideosUsecase,
    private readonly getTranscriptUsecase: GetTranscriptUsecase,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Search videos by their metadata and subtitles' })
  async search(
    @Query(new ValidationPipe({ transform: true })) query: SearchQueryDto,
    @CurrentUserEmail() email: string,
  ): Promise<SearchResult> {
    return this.searchVideosUsecase.execute(query, email);
  }

  // No ParseUUIDPipe: an id that is not a video is a 404, whatever its form.
  @Get('videos/:id/transcript')
  @ApiOperation({
    summary: 'Transcript of a video, with the segments matching q highlighted',
  })
  async transcript(
    @Param('id') id: string,
    @Query('q') q: string | string[] | undefined,
    @CurrentUserEmail() email: string,
  ): Promise<TranscriptResult> {
    // A repeated parameter arrives as an array (as for /search, a 400).
    if (Array.isArray(q)) {
      throw new BadRequestException('q must be a string');
    }
    return this.getTranscriptUsecase.execute(id, q, email);
  }
}
