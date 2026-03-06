import { createApp } from "@/index";
import type { JsonObject } from "@/types/json";

// Create app instance for tests (createApp is async)
const appPromise = createApp();

/**
 * Base URL for test requests
 */
export const baseUrl = Bun.env.TEST_BASE_URL ?? "http://localhost";

/**
 * Creates a test request with optional headers
 */
export const createRequest = (
  path: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): Request => {
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  return new Request(url, {
    method: options?.method ?? "GET",
    headers: options?.headers,
    body: options?.body,
  });
};

/**
 * Handles a request and returns the response
 */
export const handleRequest = async (request: Request): Promise<Response> => {
  const app = await appPromise;
  return app.handle(request);
};

/**
 * Asserts that a response has the expected status code
 */
export const expectStatus = (
  response: Response,
  expectedStatus: number | number[]
): void => {
  const statuses = Array.isArray(expectedStatus)
    ? expectedStatus
    : [expectedStatus];
  if (!statuses.includes(response.status)) {
    throw new Error(
      `Expected status ${statuses.join(" or ")}, got ${response.status}`
    );
  }
};

/**
 * Asserts that a response has JSON content type
 */
export const expectJsonContent = (response: Response): void => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Expected JSON content type, got ${contentType}`
    );
  }
};

/**
 * Asserts that a response has HTML content type
 */
export const expectHtmlContent = (response: Response): void => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error(
      `Expected HTML content type, got ${contentType}`
    );
  }
};

/**
 * Parses JSON response body
 */
export const parseJson = async <T = JsonObject>(
  response: Response
): Promise<T> => {
  return response.json() as Promise<T>;
};

/**
 * Parses text response body
 */
export const parseText = async (response: Response): Promise<string> => {
  return response.text();
};
