import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateBy,
} from 'class-validator';

// Same rule as the query parser: tab, newline and carriage return separate
// words, other control characters (NUL, DEL...) are removed. PostgreSQL cannot
// bind a NUL byte in text.
function stripControlCharacters(text: string): string {
  return (
    text
      .replace(/[\t\n\r]/g, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
  );
}

/** `a,b` (or a repeated parameter) becomes `['a', 'b']`; anything else is left to the validators. */
function toList(value: unknown): unknown {
  const raw = Array.isArray(value) ? value.join(',') : value;
  if (typeof raw !== 'string') return raw;
  return stripControlCharacters(raw)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/** Only `true` and `false` are booleans; anything else is left to `@IsBoolean`. */
function toBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/**
 * ISO 8601 forms that `Date` cannot read (week dates `2024-W10`, ordinal dates
 * `2024-123`) would become an Invalid Date and fail in PostgreSQL.
 */
const IsParsableDate = () =>
  ValidateBy({
    name: 'isParsableDate',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && !Number.isNaN(Date.parse(value)),
      defaultMessage: ({ property }) =>
        `${property} must be a date that can be read (YYYY-MM-DD or a full date-time)`,
    },
  });

/** Far beyond any real result list, far below what PostgreSQL binds as a bigint. */
const MAX_OFFSET = 1_000_000;

/** Query parameters of `GET /api/search`. The defaults live here. */
export class SearchQueryDto {
  /** Not length-checked here: the query parser is the single source of that 400. */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => toList(value))
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Transform(({ value }) => toList(value))
  @IsArray()
  @IsString({ each: true })
  users?: string[];

  @IsOptional()
  @IsISO8601({ strict: true })
  @IsParsableDate()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @IsParsableDate()
  dateTo?: string;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  favoris: boolean = false;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  archived: boolean = false;

  @IsIn(['relevance', 'recent'])
  sort: 'relevance' | 'recent' = 'relevance';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_OFFSET)
  offset: number = 0;
}
