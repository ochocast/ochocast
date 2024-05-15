import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { EventEntity } from '../../../../events/infra/gateways/entities/event.entity';

@Entity()
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column()
  role: string;

  @Column({
    nullable: true
  })
  description: string;

  @OneToMany(() => EventEntity, (event) => event.creator, { cascade: true })
  events: EventEntity[];

  @Column()
  createdAt: Date;

  constructor(user: Partial<UserEntity>) {
    Object.assign(this, user);
  }
}
