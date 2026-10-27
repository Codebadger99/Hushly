import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RoomsService } from '../rooms/rooms.service';


const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

@Controller('join')
export class InviteController {
  // the built index.html from your Vite app
  private template = readFileSync(
    process.env.FRONTEND_INDEX ?? join(process.cwd(), '../frontend/dist/index.html'),
    'utf8',
  );
  private baseUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';

  constructor(private rooms: RoomsService) {}

  @Get(':code')
  invite(@Param('code') code: string, @Res() res: Response) {
    const info = this.rooms.getPublicInfo(code);

    const title = info ? `You're invited to ${info.name}` : 'This room is gone';
    const desc = info ? 'Late thoughts. Good company.' : 'This Hushly room no longer exists.';
    const url = `${this.baseUrl}/join/${encodeURIComponent(code)}`;

    const tags = `
      <title>${esc(title)}</title>
      <meta name="description" content="${esc(desc)}" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Hushly" />
      <meta property="og:title" content="${esc(title)}" />
      <meta property="og:description" content="${esc(desc)}" />
      <meta property="og:url" content="${esc(url)}" />
      <meta property="og:image" content="${this.baseUrl}/og-image.png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
    `;

    // drop the default <title> from index.html, then add ours
    const html = this.template
      .replace(/<title>.*?<\/title>/s, '')
      .replace('</head>', `${tags}</head>`);

    res.set('Cache-Control', 'no-store').type('html').send(html);
  }
}