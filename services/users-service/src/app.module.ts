import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { User } from './users/entities/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'ticketing'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_NAME', 'ticketing_db'),
        entities: [User],
        // This service owns the `users` table, so it's responsible for
        // creating/updating its schema.
        synchronize: true,
        // Retry on startup: in Docker Compose, this container may start
        // slightly before Postgres finishes accepting connections.
        retryAttempts: 10,
        retryDelay: 3000,
        logging: ['error', 'warn'],
      }),
    }),
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
