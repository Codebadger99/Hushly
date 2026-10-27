import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatGateway } from './chat/chat.gateway';
import { HealthController } from './health.controller';
import { RoomsService } from './rooms/rooms.service';
import { IdentityService } from './identity/identity.service';
import { TokenService } from './identity/token.service';
import { RateLimitService } from './security/rate-limit.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  controllers: [HealthController],
  providers: [
    ChatGateway,
    RoomsService,
    IdentityService,
    TokenService,
    RateLimitService,
  ],
})
export class AppModule {}
