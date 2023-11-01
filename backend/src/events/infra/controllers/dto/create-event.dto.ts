import { IsDateString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateEventDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  description: string;

  @IsNotEmpty()
  category: string;

  @IsNotEmpty()
  tags: string[];

  @IsNotEmpty()
  @IsDateString()
  startDate: Date;

  @IsNotEmpty()
  @IsDateString()
  endDate: Date;

  @IsNotEmpty()
  @IsUUID()
  creator: string;

  @IsNotEmpty()
  isPrivate: boolean;

  @IsNotEmpty()
  imageSlug: string;
}
