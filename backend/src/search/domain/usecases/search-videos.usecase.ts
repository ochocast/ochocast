import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { SearchQueryDto } from '../../infra/controllers/search-query.dto';
import { SEARCH_GATEWAY, SearchGateway } from '../gateways/search.gateway';
import { SearchResult } from '../search.types';
import { findViewer, parseQueryOr400 } from './search-request';

/** PostgreSQL `query_canceled`, raised when `statement_timeout` is exceeded. */
const STATEMENT_TIMEOUT = '57014';

@Injectable()
export class SearchVideosUsecase {
  constructor(
    @Inject(SEARCH_GATEWAY)
    private readonly searchGateway: SearchGateway,
    @Inject('UserGateway')
    private readonly userGateway: IUserGateway,
  ) {}

  async execute(dto: SearchQueryDto, email: string): Promise<SearchResult> {
    const viewer = await findViewer(this.userGateway, email);
    if (dto.archived && !viewer.isAdmin) {
      throw new ForbiddenException('Archived videos are reserved to admins');
    }
    const parsed = parseQueryOr400(dto.q);

    try {
      return await this.searchGateway.search(
        parsed,
        {
          tags: dto.tags ?? [],
          users: dto.users ?? [],
          dateFrom: dto.dateFrom ? new Date(dto.dateFrom) : undefined,
          dateTo: dto.dateTo ? new Date(dto.dateTo) : undefined,
          favoris: dto.favoris,
          archived: dto.archived,
        },
        { limit: dto.limit, offset: dto.offset, sort: dto.sort },
        viewer,
      );
    } catch (error) {
      if ((error as { code?: unknown })?.code === STATEMENT_TIMEOUT) {
        throw new ServiceUnavailableException(
          'La recherche a pris trop de temps. Réessayez avec moins de mots.',
        );
      }
      throw error;
    }
  }
}
