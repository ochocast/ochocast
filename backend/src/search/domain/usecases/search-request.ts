import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import {
  parseSearchQuery,
  QueryTooLongError,
  TooManyGroupsError,
} from '../query-parser';
import { ParsedQuery, Viewer } from '../search.types';

/** The user behind the request e-mail; 403 when there is none (R9). */
export async function findViewer(
  users: IUserGateway,
  email: string,
): Promise<Viewer> {
  const user = email ? await users.getUserByEmail(email) : null;
  if (!user) throw new ForbiddenException('User not found');
  return { userId: user.id, isAdmin: user.role === 'admin' };
}

/** Parses `q`; a query the parser refuses (too long, too many groups) is a 400. */
export function parseQueryOr400(q: string | undefined): ParsedQuery {
  try {
    return parseSearchQuery(q);
  } catch (error) {
    if (
      error instanceof QueryTooLongError ||
      error instanceof TooManyGroupsError
    ) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
