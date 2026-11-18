import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { SearchQueryDto } from '../../infra/controllers/search-query.dto';
import { SEARCH_GATEWAY, SearchGateway } from '../gateways/search.gateway';
import {
  parseSearchQuery,
  QueryTooLongError,
  TooManyGroupsError,
} from '../query-parser';
import { SearchResult } from '../search.types';

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
    const user = email ? await this.userGateway.getUserByEmail(email) : null;
    if (!user) throw new ForbiddenException('User not found');
    const isAdmin = user.role === 'admin';
    if (dto.archived && !isAdmin) {
      throw new ForbiddenException('Archived videos are reserved to admins');
    }

    try {
      return await this.searchGateway.search(
        parseSearchQuery(dto.q),
        {
          tags: dto.tags ?? [],
          users: dto.users ?? [],
          dateFrom: dto.dateFrom ? new Date(dto.dateFrom) : undefined,
          dateTo: dto.dateTo ? new Date(dto.dateTo) : undefined,
          favoris: dto.favoris,
          archived: dto.archived,
        },
        { limit: dto.limit, offset: dto.offset, sort: dto.sort },
        { userId: user.id, isAdmin },
      );
    } catch (error) {
      if (
        error instanceof QueryTooLongError ||
        error instanceof TooManyGroupsError
      ) {
        throw new BadRequestException(error.message);
      }
      if ((error as { code?: unknown })?.code === STATEMENT_TIMEOUT) {
        throw new ServiceUnavailableException(
          'La recherche a pris trop de temps. Réessayez avec moins de mots.',
        );
      }
      throw error;
    }
  }
}
