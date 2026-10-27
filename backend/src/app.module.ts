import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatGateway } from './chat/chat.gateway';
import { HealthController } from './health.controller';
import { RoomsService } from './rooms/rooms.service';
import { IdentityService } from './identity/identity.service';
import { TokenService } from './identity/token.service';
import { RateLimitService } from './security/rate-limit.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { InviteController } from './invite/invite.controller';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), '../frontend/dist'),
      exclude: ['/join/(.*)', '/socket.io/(.*)'],
    }),
  ],
  controllers: [HealthController, InviteController],
  providers: [
    ChatGateway,
    RoomsService,
    IdentityService,
    TokenService,
    RateLimitService,
  ],
})
export class AppModule {}
