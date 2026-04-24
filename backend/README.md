# Quasar Contact — Backend

Node.js/Express server with Socket.IO, PostgreSQL, and Prisma ORM.

Originally developed as a separate repository:
[quasar-chat-backend](https://github.com/art2url/quasar-chat-backend)

See the [main README](../README.md) for full architecture, security implementation, and
deployment documentation.

## Quick start

```bash
npm install
npm run dev   # dev server on http://localhost:3000
```

### Prerequisites

- Node.js 22+ and npm 10+
- PostgreSQL 14+
- `backend/.env` configured — see [Getting started](../README.md#getting-started) in the main README

## Scripts

```bash
npm run dev          # ts-node-dev with hot reload
npm run build        # prisma generate + tsc
npm start            # start production server
npm run typecheck    # tsc --noEmit
npm test             # jest
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier format
npm run style:fix    # ESLint + Prettier fix

# Database
npx prisma migrate dev    # run migrations
npx prisma generate       # generate Prisma client
npx prisma studio         # open Prisma Studio UI
```
