import { IsNotEmpty } from 'class-validator';

export class UpdateUserDto {
  @IsNotEmpty()
  username: string;

  description: string;

  picture_id: string;
}
