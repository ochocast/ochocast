import { IsDateString, IsNotEmpty, IsNumber } from 'class-validator';

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
  date: Date;

  @IsNotEmpty()
  @IsNumber()
  creator: bigint;

  @IsNotEmpty()
  isPrivate: boolean;

  @IsNotEmpty()
  imageSlug: string;
}
