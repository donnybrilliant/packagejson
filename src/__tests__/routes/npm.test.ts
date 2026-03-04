import { describe, test } from "bun:test";
import { createRequest, expectStatus, handleRequest } from "../helpers/test-utils";

describe("Removed standalone npm routes", () => {
  test("GET /npm returns 404", async () => {
    const response = await handleRequest(createRequest("/npm"));
    expectStatus(response, 404);
  });

  test("GET /npm/:packageName returns 404", async () => {
    const response = await handleRequest(createRequest("/npm/elysia"));
    expectStatus(response, 404);
  });

  test("GET /npm/:packageName/downloads returns 404", async () => {
    const response = await handleRequest(createRequest("/npm/elysia/downloads"));
    expectStatus(response, 404);
  });
});
