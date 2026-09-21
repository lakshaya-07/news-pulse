import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cors from "cors";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { applySchema, pool, query } from "./db.js";
import {
  getCluster,
  getTimeline,
  ingestStatus,
  listArticles,
  listClusters,
  triggerIngest,
} from "./controllers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const app = express();
const port = Number(process.env.PORT || 43101);
const frontendOrigin =
  process.env.FRONTEND_URL ||
  process.env.CORS_ORIGIN ||
  "http://localhost:43100";

app.use(
  cors({
    origin: frontendOrigin.split(",").map((s) => s.trim()),
    methods: ["GET", "POST", "OPTIONS"],
  }),
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "News Pulse API",
    endpoints: [
      "GET /health",
      "GET /api/articles?limit=15",
      "GET /api/clusters?sources=BBC,NPR",
      "GET /api/clusters/:id",
      "GET /api/timeline",
      "POST /api/ingest/trigger",
      "GET /api/ingest/status/:jobId",
    ],
  });
});

app.get("/health", async (_req, res, next) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/articles", listArticles);
app.get("/api/clusters", listClusters);
app.get("/api/clusters/:id", getCluster);
app.get("/api/timeline", getTimeline);
app.post("/api/ingest/trigger", triggerIngest);
app.get("/api/ingest/status/:jobId", ingestStatus);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const message =
    err instanceof Error ? err.message : "Internal Server Error";
  res.status(500).json({ error: message });
});

async function boot() {
  await applySchema();
  app.listen(port, "0.0.0.0", () => {
    console.log(`News Pulse API listening on http://0.0.0.0:${port}`);
  });
}

boot().catch(async (err) => {
  console.error("Failed to start API", err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
