## Highly Customisable Kanboard Application - Still in early development. 

# Setup

This project requires **Node.js 20+** (LTS recommended). The project uses nvm (Node Version Manager) for version management.

## Local Development with Supabase

For complete local development with Supabase (database, auth, storage, edge functions), see the [Local Development Guide](docs/LOCAL_DEVELOPMENT.md).

**Quick Setup:**
```bash
# Run automated setup (generates keys, starts services, applies schema)
./scripts/dev-setup.sh

# Configure Google OAuth in .env.local (see guide)

# Start development
./scripts/dev-start.sh
```

## Quick Start (Frontend Only)

If you're connecting to an existing Supabase instance:

1. **Ensure nvm is installed and Node 20 is set up:**
   ```bash
   source setup-nvm.sh
   ```

2. **If you encounter `npm_config_prefix` errors, unset it:**
   ```bash
   unset npm_config_prefix
   ```

3. **Install dependencies:**
   ```bash
   npm install --legacy-peer-deps
   ```

4. **Configure environment variables:**
   Create `.env.local` with:
   ```bash
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
   ```

5. **Run the development server:**
   ```bash
   npm run dev
   ```

The project includes a `.nvmrc` file that automatically uses Node 20 when you run `nvm use` in the project directory.

# Planned Features
- Import csv/tsv.
- 2FA
- 3 tab Sidebar with board settings, theming, member list etc.
- More authentications
- Granular permission control in admin panel
- Mobile Apps/Local storage/PWA
- Conversion to Node.js/Native.js for server-side code rather than large client-side.
- Properly packaged standalone app. 

# In Progress
- implement database rate-limiting
- Implement strict database/filehandling security policies
- Implement session timeout for all logins

# Implemented features
- Import trello/wekan, fine tuning still to go. 
- Customisable app name, login icon, tagline text, font size, text size.
- Customisable app images/branding. 
- Local login/accounts, Google login only, Google + External Verification, more to come. 
- Admin, Manager and Viewer ready only roles. More to come. 
- Cards, Lists, Boards,
- Rich text editor in the card description w/markdown and code support. 
- Enable authentication/verification to external database

This project is built with:
- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
