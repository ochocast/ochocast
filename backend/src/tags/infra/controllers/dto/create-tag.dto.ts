import { IsNotEmpty, IsOptional } from 'class-validator';

export class CreateTagDto {
  @IsNotEmpty()
  name: string;

  @IsOptional()
  videos: string[];
}
