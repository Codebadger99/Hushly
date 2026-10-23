import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CorsIoAdapter } from './chat/cors-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new CorsIoAdapter(app));
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();