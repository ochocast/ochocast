import { IsNotEmpty } from 'class-validator';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

export class CreateCommentDto {
  @IsNotEmpty()
  creator: UserEntity;

  @IsNotEmpty()
  content: string;
}
