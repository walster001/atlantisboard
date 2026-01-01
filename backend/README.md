# AtlantisBoard Backend

Self-hosted backend for AtlantisBoard, migrated from Supabase/Lovable.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Set up database:
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations (when ready)
npm run prisma:migrate
```

4. Start development server:
```bash
npm run dev
```

## Environment Variables

See `.env.example` for all required environment variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for signing JWT access tokens
- `JWT_REFRESH_SECRET` - Secret for signing JWT refresh tokens
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (optional)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (optional)

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Sign up with email/password
- `POST /api/auth/signin` - Sign in with email/password
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/signout` - Sign out
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback
- `POST /api/auth/verify-email` - Verify email against MySQL (for google_verified mode)

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:studio` - Open Prisma Studio
- `npm run type-check` - Run TypeScript type checking

## Architecture

- **Express.js** - Web framework
- **Prisma** - ORM for database access
- **PostgreSQL** - Database
- **JWT** - Authentication tokens
- **Passport.js** - OAuth authentication

