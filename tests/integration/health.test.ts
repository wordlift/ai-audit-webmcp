import request from "supertest";
import { createApp } from "../../src/server/app.js";

describe("GET /api/health", () => {
  it("reports a healthy service without leaking framework details", async () => {
    const response = await request(createApp()).get("/api/health").expect(200);

    expect(response.body).toEqual({ status: "ok", service: "ai-audit-webmcp" });
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
