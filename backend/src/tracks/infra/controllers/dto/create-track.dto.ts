import { IsNotEmpty } from 'class-validator';

export class CreateTrackDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  description: string;

  @IsNotEmpty()
  keywords: string[];

  startDate: Date;

  endDate: Date;

  @IsNotEmpty()
  eventId: string;

  speakers: string[];
}
