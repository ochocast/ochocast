import { IsNotEmpty } from 'class-validator';

export class TrackDto {
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
