import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig, DatabaseConfig } from './config';
import { EventsModule } from './events/events.module';
import { UsersModule } from './users/users.module';
import { TracksModule } from './tracks/tracks.module';
import { KeycloakModule } from './keycloak.module';
import { CommentsModule } from './comments/comments.module';
import { TagsModule } from './tags/tags.module';
import { VideosModule } from './videos/videos.module';
import { S3Module } from './s3.module';
import { ConfigManagementModule } from './config-management/config-management.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ChatModule } from './chat/chat.module';
import { PollsModule } from './polls/polls.module';
import { RecordingModule } from './recording/recording.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [AppConfig, DatabaseConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        ...configService.get('database'),
      }),
      inject: [ConfigService],
    }),
    KeycloakModule,
    EventsModule,
    UsersModule,
    TracksModule,
    TagsModule,
    VideosModule,
    CommentsModule,
    S3Module,
    ConfigManagementModule,
    ChatModule,
    PollsModule,
    RecordingModule,
  ],
})
export class AppModule {}
