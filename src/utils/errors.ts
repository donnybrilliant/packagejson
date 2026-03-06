import type { JsonObject, JsonValue } from "@/types/json";

/**
 * Type guard to check if an object has a message property (GitHub API error)
 */
export const isErrorResponse = (
  data: JsonValue | null | undefined
): data is { message: string } => {
  return (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof (data as { message?: JsonValue }).message === "string"
  );
};

/**
 * Type guard to check if data is an array
 */
export const isArray = (data: JsonValue | null | undefined): data is JsonValue[] => {
  return Array.isArray(data);
};

/**
 * Type guard to check if data is a record/object
 */
export const isRecord = (data: JsonValue | null | undefined): data is JsonObject => {
  return typeof data === "object" && data !== null && !Array.isArray(data);
};

/**
 * Safely extracts error message from runtime error values
 */
export const getErrorMessage = <T>(error: T): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
};
