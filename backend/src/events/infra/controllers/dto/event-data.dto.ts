import { IsDateString, IsNotEmpty } from 'class-validator';

export class EventDataDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  description: string;

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
