import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

export class CorsIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    const origins = (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    return super.createIOServer(port, {
      ...options,
      // No origins configured = browsers are blocked, which is the safe default
      cors: { origin: origins.length ? origins : false },
      maxHttpBufferSize: 10_000, // 10 KB cap per event, stops oversized payloads
    } as ServerOptions);
  }
}