# RZS Stats

Madden league stats site for Red Zone Sports (RZS). Pulls game data from
neonsportz.com and computes PythagoreanPat win expectancy and strength-of-schedule metrics.

## Local Development

### Prerequisites
- Java 21
- Maven
- Node 20
- PostgreSQL (or Docker)

### 1. Start the database

```bash
# Option A: Docker
docker compose up postgres -d

# Option B: local PostgreSQL — create a database named rzs_stats
```

### 2. Start the backend

```bash
cd backend
mvn spring-boot:run
# Runs on http://localhost:8080
```

### 3. Seed initial data

Trigger the first sync via the admin endpoint:
```bash
curl -X POST http://localhost:8080/api/admin/sync
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

---

## Deployment on Railway

1. Create a new Railway project
2. Add a **PostgreSQL** plugin — Railway provides `DATABASE_URL` automatically
3. Deploy the **backend** service from `./backend`:
   - Set env vars: `DATABASE_URL` (from Railway plugin), `ALLOWED_ORIGINS` (your frontend URL)
4. Deploy the **frontend** service from `./frontend`:
   - Build command: `npm run build`
   - Output directory: `dist`
5. After first deploy, trigger an initial sync:
   ```
   POST https://your-backend.railway.app/api/admin/sync
   ```

---

## API Reference

| Endpoint | Description |
|----------|-------------|
| `GET /api/seasons` | Available season indices |
| `GET /api/standings?season={n}` | Full standings with PyPat and SoS |
| `GET /api/games?season={n}&week={w}&stage={s}` | Game results |
| `GET /api/games/weeks?season={n}&stage={s}` | Available weeks |
| `GET /api/trends/season` | Season-over-season stats |
| `GET /api/trends/weekly?season={n}` | Week-by-week standings |
| `POST /api/admin/sync` | Trigger manual data sync |
| `GET /api/admin/sync/status` | Last sync status |

---

## Custom Stats

**PythagoreanPat (PyPat)** — Expected win percentage based on points for/against:
```
exponent = ((PF + PA) / games) ^ 0.251
PyPat    = PF^exp / (PF^exp + PA^exp)
```

**SoS (Curr)** — In-season strength of schedule: average of opponents' PyPat this season, excluding head-to-head games.

**SoS (Prev)** — Pre-season strength of schedule: average of opponents' PyPat from the prior season (most useful early in the current season).
