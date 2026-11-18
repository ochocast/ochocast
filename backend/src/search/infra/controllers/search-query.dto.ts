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
} from 'class-validator';

/** `a,b` (or a repeated parameter) becomes `['a', 'b']`; anything else is left to the validators. */
function toList(value: unknown): unknown {
  const raw = Array.isArray(value) ? value.join(',') : value;
  if (typeof raw !== 'string') return raw;
  return raw
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
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
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
  offset: number = 0;
}
