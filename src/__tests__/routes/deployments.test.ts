import { describe, test } from "bun:test";
import { createRequest, expectStatus, handleRequest } from "../helpers/test-utils";

describe("Removed deployment routes", () => {
  test("GET /netlify returns 404", async () => {
    const response = await handleRequest(createRequest("/netlify"));
    expectStatus(response, 404);
  });

  test("GET /vercel returns 404", async () => {
    const response = await handleRequest(createRequest("/vercel"));
    expectStatus(response, 404);
  });

  test("GET /render returns 404", async () => {
    const response = await handleRequest(createRequest("/render"));
    expectStatus(response, 404);
  });
});
