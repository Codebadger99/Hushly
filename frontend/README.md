# Hushly frontend

The React app connects to the NestJS backend over Socket.IO. It supports room creation, joining
with an 8-character room code, anonymous backend-generated names, live messages and typing status,
participant counts, owner-only invite codes and participant controls, reconnecting, leaving, and
host-only room closure. Creating a room opens a share page with its code and an invitation link;
opening that link previews the room and asks guests to enter the 8-character code before joining.
Owners can block and unblock browser identities;
without accounts, a block can be bypassed by clearing site data or switching browsers/devices.

## Run locally

1. Start the backend from `backend` with `npm run start:dev` (port `3000` by default).
2. Allow the Vite origin in `backend/.env`:

   ```env
   CORS_ORIGIN=http://localhost:5173
   ```

3. Start the frontend from `frontend` with `npm run dev`.

During development, the frontend connects to `http://localhost:3000`. Set `VITE_SOCKET_URL` when
the backend is hosted at a different address. In production, configure it before building if the
backend is not served from the same origin as the frontend.

Vercel's production URL is detected automatically for the Open Graph metadata. If you use a custom
domain, set `VITE_SITE_URL` to its public HTTPS origin in the production build environment so
WhatsApp can load the Hushly invitation preview image. Social platforms cache link previews, so
refresh or re-share a link after deployment to see updated metadata.

## Available commands

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks and builds the production app.
- `npm run lint` runs ESLint.

Room names are limited to 50 characters and messages to 1,000 characters. The backend creates
unique temporary display names, limits room/message requests, keeps messages only while a room
exists, and expires empty rooms automatically. If the owner disconnects unexpectedly, the room
shows the configured reconnect grace period before closing.
