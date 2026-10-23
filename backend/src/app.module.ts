import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RoomsService } from './rooms/rooms.service';
import { IdentityService } from './identity/identity.service';


@Module({
  controllers: [AppController],
  providers: [AppService, RoomsService, IdentityService],
})
export class AppModule {}
