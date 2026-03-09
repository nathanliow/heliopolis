# Heliopolis

A 3D city visualization of Solana wallets. Every wallet becomes a building — taller buildings traded more, wider buildings moved more volume, and lit windows reflect how many tokens they've touched. Swap transactions drive animated cars through the streets in real time.

Built with Next.js, React Three Fiber, Supabase, and Helius.

## How Helius Powers the City

Helius provides all on-chain data that shapes the city:

- **Wallet Identity** (`/v1/wallet/{address}/identity`) — Identifies known wallets (exchanges, protocols, notable accounts) and labels their buildings.
- **Wallet Funding** (`/v1/wallet/{address}/funded-by`) — Retrieves each wallet's first funding transaction to calculate wallet age.
- **DAS API** (`getAssetsByOwner`) — Fetches all fungible token balances with live prices for the wallet detail panel.
- **Enhanced Webhooks** — Listens for `SWAP` events across tracked wallets in real time. Each swap spawns a car on the city streets and is stored for historical playback.
- **Transaction History** (`getTransactionsForAddress` RPC) — Powers the ingestion worker. Fetches full wallet history across parallel time-range slices to compute volume, fees, token interactions, and wallet age. Also used for bot detection via transaction density analysis.

## Address Ingestion

When a user searches for a wallet, it's enqueued for ingestion. A standalone Node.js worker on a DigitalOcean droplet processes the queue:

1. **Enqueue** — The Next.js API inserts the wallet + a single-slice job into `ingestion_queue`
2. **Claim** — The worker continuously polls `claim_next_ingestion_job()` across 20 concurrent worker loops
3. **Dynamic slicing** — On claim, the worker checks how many jobs are active and splits the wallet's history into parallel time-range slices:
   - 1 wallet in queue → 16 slices (max parallelism)
   - 10 wallets → 8 slices each
   - 80+ wallets → 1 slice each
4. **Rate-limited fetching** — All Helius RPC calls go through a shared token-bucket rate limiter at 90 req/s (10% headroom below the 100 req/s plan limit)
5. **Checkpoints** — Every 30 seconds, all slice states and stats are saved atomically. If the worker crashes, it resumes from the last checkpoint without re-splitting
6. **Completion** — Once all slices finish, the worker enriches token metadata via `getAssetBatch`, assigns a city grid position, and marks the wallet complete

The worker runs via PM2 at `/opt/heliopolis-worker/` on the droplet. Deploy with:

```bash
scp worker/index.js root@<DROPLET_IP>:/opt/heliopolis-worker/index.js
pm2 restart heliopolis-worker
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx                        # Main 3D city view
│   └── api/
│       ├── wallet/[address]/           # Wallet stats, balances, identity
│       ├── wallets/                    # All placed wallets
│       ├── snapshots/                  # City state snapshots
│       ├── webhooks/helius/            # Incoming swap events
│       └── auth/                       # Phantom + X OAuth
├── components/                         # React / Three.js components
│   ├── CityScene.tsx                   # Main 3D orchestrator
│   ├── CityGrid.tsx                    # City layout & building placement
│   ├── InstancedBuildings.tsx          # Instanced building meshes
│   ├── InstancedSkyscrapers.tsx        # High-value wallet buildings
│   ├── InstancedCars.tsx               # Animated swap transaction cars
│   ├── WalletPanel.tsx                 # Wallet detail panel
│   ├── WalletSearch.tsx                # Search & wallet ingestion
│   └── ...
├── lib/
│   ├── helius.ts                       # Helius API calls (identity, funding)
│   ├── helius-webhook.ts               # Webhook creation & management
│   ├── bot-detection.ts                # Bot detection via tx analysis
│   ├── swap-events.ts                  # Supabase Realtime subscription
│   ├── building-math.ts                # Building dimension calculations
│   ├── building-shader.ts              # Window lighting shader
│   ├── car-system.ts                   # Car animation logic
│   └── ...
├── context/
│   └── AuthContext.tsx                 # Auth state (Phantom + X)
├── types/
│   └── wallet.ts                       # Core type definitions
worker/
├── index.js                            # Ingestion worker (runs on DO droplet)
├── package.json                        # Worker dependencies
└── ecosystem.config.cjs                # PM2 configuration
```

## Local Setup

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Helius](https://dashboard.helius.dev/) API key

### 1. Clone and install

```bash
git clone <repo-url>
cd heliopolis
npm install
```

### 2. Configure environment

Copy the example env file and fill in your keys:

```bash
cp .env.local.example .env.local
```

```
HELIUS_API_KEY=your_helius_api_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
HELIUS_WEBHOOK_SECRET=your_webhook_secret
HELIUS_WEBHOOK_ID=your_webhook_id
```

### 3. Set up Supabase

Run the SQL migrations in order against your Supabase project. You can paste them into the SQL Editor in the Supabase Dashboard, or use the Supabase CLI:

```bash
# Via Supabase CLI
supabase db push
```

Or manually in the SQL Editor, run each file in `supabase/migrations/` in order:

1. **`00001_schema.sql`** — Tables, indexes, RLS policies, and Realtime publication
2. **`00002_functions.sql`** — PL/pgSQL functions (wallet ingestion, city placement, snapshots)
3. **`00003_seed_spiral.sql`** — Seeds the 26x26 city grid spiral layout (676 blocks, 10 parks)
4. **`00004_cron.sql`** — Cron job for periodic city snapshots

Before running the migrations, enable **pg_cron** via the Supabase Dashboard (Database → Extensions).

### 4. Set up Helius webhook

Create an **enhanced** webhook in the [Helius dashboard](https://dashboard.helius.dev/) filtering for `SWAP` transaction types. Point it at your deployed URL:

```
POST https://your-domain.com/api/webhooks/helius
```

Or use the setup script:

```bash
npx tsx scripts/setup-webhook.ts https://your-domain.com
```

Set the webhook ID and secret in your `.env.local`.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech Stack

- **Next.js 16** — App router, API routes, server components
- **React Three Fiber** — 3D rendering with Three.js
- **Tailwind CSS 4** — Styling
- **Supabase** — PostgreSQL database, auth, and realtime subscriptions
- **Helius** — Solana RPC, DAS API, wallet intelligence, and webhooks
