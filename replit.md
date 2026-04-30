# Workspace

## Overview

pnpm workspace monorepo using TypeScript. デジタルスタンプラリーアプリ（飯能まつり）— LINE LIFF対応のQRコードスタンプラリーシステム。

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite (artifacts/hanno-matsuri)
- **Auth**: LINE LIFF (with mock login for dev)
- **QR Scanner**: @zxing/browser

## Artifacts

- **hanno-matsuri** (`/`): React + Vite frontend — stamp card UI, QR scanner, prizes, admin dashboard
- **api-server** (`/api`): Express 5 backend — auth, stamps, prizes, admin APIs

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Database Schema

- `users` — LINE users (userId, lineUserId, displayName, sessionToken, isAdmin)
- `spots` — 11 stamp spots (name, location, order, token for QR)
- `stamps` — user stamp records (userId, spotId, triggerType: QR|BEACON)
- `prize_redemptions` — prize claims (userId, tier: bronze|silver|complete)

## Prize Tiers

- Bronze: 6 stamps
- Silver: 11 stamps
- Complete: コンプリート賞 (all 11 unique spots)

## API Routes

- `POST /api/auth/line` — LINE LIFF login
- `GET /api/auth/me` — Get current user
- `GET /api/stamps/card` — Get stamp card (all 11 spots + user progress)
- `POST /api/stamps/apply` — Apply stamp { token, triggerType: QR|BEACON }
- `GET /api/prizes/status` — Prize eligibility
- `POST /api/prizes/redeem` — Redeem prize (staff)
- `GET /api/admin/spots` — List all spots with tokens
- `POST /api/admin/spots/:spotId/token` — Rotate QR token
- `GET /api/admin/users` — User list with stats
- `GET /api/admin/users/:userId` — User detail
- `GET /api/admin/export/csv` — CSV export
- `GET /api/admin/stats` — Event statistics

## Environment Variables

- `VITE_LIFF_ID` — LINE LIFF App ID (frontend; optional for dev, uses mock login)
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Session signing secret

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
