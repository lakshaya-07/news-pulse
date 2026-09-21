import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export type JobStatus = "running" | "completed" | "failed";

export interface IngestJob {
  jobId: string;
  status: JobStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  log: string[];
  summary?: string;
}

const jobs = new Map<string, IngestJob>();
let activeJobId: string | null = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

export function getJob(jobId: string): IngestJob | undefined {
  return jobs.get(jobId);
}

export function getActiveJobId(): string | null {
  return activeJobId;
}

export function startIngestJob(): IngestJob {
  if (activeJobId) {
    const existing = jobs.get(activeJobId);
    if (existing && existing.status === "running") {
      const err = new Error("An ingest job is already running") as Error & {
        status: number;
        jobId: string;
      };
      err.status = 409;
      err.jobId = activeJobId;
      throw err;
    }
  }

  const jobId = randomUUID();
  const job: IngestJob = {
    jobId,
    status: "running",
    startedAt: new Date().toISOString(),
    log: [],
  };
  jobs.set(jobId, job);
  activeJobId = jobId;

  const pythonBin = process.env.PYTHON_BIN || "python3";
  const child: ChildProcessWithoutNullStreams = spawn(
    pythonBin,
    ["-m", "pipeline.main"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const append = (chunk: Buffer) => {
    const lines = chunk.toString("utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      job.log.push(line);
      if (job.log.length > 200) job.log.shift();
    }
  };

  child.stdout.on("data", append);
  child.stderr.on("data", append);

  child.on("error", (err) => {
    job.status = "failed";
    job.error = err.message;
    job.completedAt = new Date().toISOString();
    if (activeJobId === jobId) activeJobId = null;
  });

  child.on("close", (code) => {
    job.completedAt = new Date().toISOString();
    if (code === 0) {
      job.status = "completed";
      job.summary = job.log.at(-1) || "Pipeline finished";
    } else {
      job.status = "failed";
      job.error = job.log.at(-1) || `Pipeline exited with code ${code}`;
    }
    if (activeJobId === jobId) activeJobId = null;
  });

  return job;
}
