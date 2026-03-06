import { env } from "@/env";
import type { JsonObject } from "@/types/json";

type LogLevel = "info" | "error" | "warn" | "debug";

/**
 * Logs a message with optional metadata
 * @param level - Log level (info, error, warn, debug)
 * @param message - Log message
 * @param meta - Optional metadata object
 */
export const log = (
  level: LogLevel,
  message: string,
  meta?: JsonObject
): void => {
  if (env.NODE_ENV === "test") return;

  const timestamp = new Date().toISOString();
  const payload = meta
    ? `[${timestamp}] ${message} ${JSON.stringify(meta)}`
    : `[${timestamp}] ${message}`;

  switch (level) {
    case "info":
      console.info(payload);
      break;
    case "error":
      console.error(payload);
      break;
    case "warn":
      console.warn(payload);
      break;
    case "debug":
      if (env.NODE_ENV === "development") {
        console.debug(payload);
      }
      break;
  }
};
