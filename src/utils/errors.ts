/**
 * Type guard to check if an object has a message property (GitHub API error)
 */
export const isErrorResponse = (
  data: unknown
): data is { message: string } => {
  return (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string"
  );
};

/**
 * Type guard to check if data is an array
 */
export const isArray = (data: unknown): data is unknown[] => {
  return Array.isArray(data);
};

/**
 * Type guard to check if data is a record/object
 */
export const isRecord = (data: unknown): data is Record<string, unknown> => {
  return typeof data === "object" && data !== null && !Array.isArray(data);
};

/**
 * Safely extracts error message from unknown error type
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
};

