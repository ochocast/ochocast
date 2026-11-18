import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
import { SearchResult } from '../../domain/search.types';
import { SearchVideosUsecase } from '../../domain/usecases/search-videos.usecase';
import { SearchQueryDto } from './search-query.dto';

@ApiTags('Search')
@Controller()
export class SearchController {
  constructor(private readonly searchVideosUsecase: SearchVideosUsecase) {}

  @Get('search')
  @ApiOperation({ summary: 'Search videos by their metadata and subtitles' })
  async search(
    @Query(new ValidationPipe({ transform: true })) query: SearchQueryDto,
    @CurrentUserEmail() email: string,
  ): Promise<SearchResult> {
    return this.searchVideosUsecase.execute(query, email);
  }
}
