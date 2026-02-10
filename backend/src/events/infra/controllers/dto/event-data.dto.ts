import { IsDateString, IsNotEmpty } from 'class-validator';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

export class EventDataDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  description: string;

  @IsNotEmpty()
  tags: TagEntity[];

  @IsNotEmpty()
  @IsDateString()
  startDate: Date;

  @IsNotEmpty()
  @IsDateString()
  endDate: Date;

  @IsNotEmpty()
  imageSlug: string;

  @IsNotEmpty()
  miniature: File;
}
