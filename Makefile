# NEXUS OS — Makefile
# Usage: make <target>
#
# Quickstart: make setup

.PHONY: setup dev build deploy db-push db-seed check clean help

# ─── Setup ───────────────────────────────────────────────────────────────────

## setup: Full first-time setup (deps + env + DB + dev server)
setup:
	node scripts/setup.mjs

## setup-yes: Non-interactive setup (uses .env defaults, skips prompts)
setup-yes:
	node scripts/setup.mjs --yes

## check: Health check only — no changes
check:
	node scripts/setup.mjs --check

# ─── Development ─────────────────────────────────────────────────────────────

## dev: Start the dev server
dev:
	pnpm dev

## install: Install all dependencies
install:
	pnpm install

# ─── Database ────────────────────────────────────────────────────────────────

## db-push: Push Prisma schema to database (create/update tables)
db-push:
	pnpm db:push

## db-seed: Seed the database with sample data
db-seed:
	pnpm db:seed

## db-studio: Open Prisma Studio (visual DB browser)
db-studio:
	npx prisma studio

# ─── Build & Deploy ──────────────────────────────────────────────────────────

## build: Production build
build:
	pnpm build

## deploy: Push to git (triggers Vercel deploy)
deploy:
	git push

# ─── Utilities ───────────────────────────────────────────────────────────────

## clean: Remove build artifacts and node_modules
clean:
	rm -rf apps/web/.next apps/web/node_modules node_modules .turbo

## tsc: TypeScript type check (no emit)
tsc:
	npx tsc --noEmit -p apps/web/tsconfig.json

## help: Show this help
help:
	@echo ""
	@echo "  NEXUS OS — Available commands"
	@echo ""
	@grep -E '^## ' Makefile | sed 's/## /  make /' | sed 's/: /\t\t/'
	@echo ""
