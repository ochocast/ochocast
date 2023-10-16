import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateTrackDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  description: string;

  @IsNotEmpty()
  keywords: string[];

  @IsNotEmpty()
  streamkey: string;

  @IsNotEmpty()
  @IsNumber()
  event: bigint;
}
