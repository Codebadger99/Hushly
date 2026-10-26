import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

export function isAllowedSocketOrigin(origin: unknown, origins: string[]) {
  return typeof origin === 'string' && origins.includes(origin);
}

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
      cors: { origin: origins.length ? origins : false },
      allowRequest: (request, callback) => {
        callback(null, isAllowedSocketOrigin(request.headers.origin, origins));
      },
      maxHttpBufferSize: 10_000,
    } as ServerOptions);
  }
}