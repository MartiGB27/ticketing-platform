import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { User } from './users/entities/user.entity';

@Module({
  imports: [
    // First import on purpose: as early as possible so bootstrap-time
    // logs also go through pino. See main.ts for the other half of this
    // (bufferLogs + app.useLogger) — together they replace Nest's
    // default text logger everywhere, including every existing
    // `new Logger(ClassName.name)` call already in this codebase,
    // without touching those call sites.
    LoggerModule.forRoot({
      pinoHttp: {
        // Reuse the request id the Gateway generated/forwarded, so the
        // same id shows up in this service's logs and the Gateway's for
        // the same request. Falls back to generating one if this
        // service is reached directly (bypassing the Gateway).
        genReqId: (req: any, res: any) => {
          const existing = req.headers['x-request-id'];
          if (existing) return existing;
          const id = randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        // Never let a JWT leak into aggregated logs.
        redact: ['req.headers.authorization'],
      },
    }),
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
