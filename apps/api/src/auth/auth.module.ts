import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasswordResetService } from './password-reset.service';
import { LocalStrategy } from './local.strategy';
import { JwtStrategy } from './jwt.strategy';
import { MfaSessionStrategy } from './mfa-session.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { resolveJwtSecret } from './jwt-secret';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        secret: resolveJwtSecret(config.get<string>('JWT_SECRET')),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '1h') as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, PasswordResetService, LocalStrategy, JwtStrategy, MfaSessionStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
