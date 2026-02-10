import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('config_files')
export class ConfigFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  fileUrl: string;

  @CreateDateColumn()
  createdAt: Date;
}
