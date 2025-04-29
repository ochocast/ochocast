import { IsNotEmpty } from 'class-validator';

export class CreateTrackDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  description: string;

  @IsNotEmpty()
  keywords: string[];

  @IsNotEmpty()
  eventId: string;

  speakers: string[];
}
