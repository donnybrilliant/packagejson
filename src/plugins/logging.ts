import { Elysia } from "elysia";
import { env } from "@/env";

type LogLevel = "info" | "error";

const log = (
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
) => {
  if (env.NODE_ENV === "test") return;
  const payload = meta ? `${message} ${JSON.stringify(meta)}` : message;
  if (level === "info") {
    console.info(payload);
  } else {
    console.error(payload);
  }
};

type LoggingContext = {
  startTime: number;
};

export const loggingPlugin = new Elysia({ name: "bun-logging" })
  .derive<LoggingContext>(() => ({
    startTime: performance.now(),
  }))
  .onAfterHandle(({ request, set, store }) => {
    const startTime =
      (store as Partial<LoggingContext>).startTime ?? performance.now();
    const durationMs = performance.now() - startTime;
    const status = set.status ?? 200;
    const url = new URL(request.url);

    log("info", "request.completed", {
      method: request.method,
      path: url.pathname,
      status,
      durationMs: Number(durationMs.toFixed(2)),
    });
  })
  .onError(({ request, error, code }) => {
    const url = new URL(request.url);
    log("error", "request.error", {
      method: request.method,
      path: url.pathname,
      code,
      message: error instanceof Error ? error.message : String(error),
    });
  });
