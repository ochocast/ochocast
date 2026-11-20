import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { SEARCH_GATEWAY, SearchGateway } from '../gateways/search.gateway';
import { TranscriptResult } from '../search.types';
import { findViewer, parseQueryOr400 } from './search-request';

@Injectable()
export class GetTranscriptUsecase {
  constructor(
    @Inject(SEARCH_GATEWAY)
    private readonly searchGateway: SearchGateway,
    @Inject('UserGateway')
    private readonly userGateway: IUserGateway,
  ) {}

  async execute(
    videoId: string,
    q: string | undefined,
    email: string,
  ): Promise<TranscriptResult> {
    const viewer = await findViewer(this.userGateway, email);
    const parsed = parseQueryOr400(q);

    // Unknown video, malformed id, archived video of a non-admin: all a 404.
    const transcript = await this.searchGateway.transcript(
      videoId,
      parsed.isEmpty ? null : parsed,
      viewer,
    );
    if (!transcript) throw new NotFoundException('Video not found');
    return transcript;
  }
}
