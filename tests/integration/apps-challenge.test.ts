import request from "supertest";
import { createApp } from "../../src/server/app.js";

/**
 * The app directory verifies this domain by fetching one path and comparing what comes back with
 * the token it issued. Anything else answering — the SPA above all — reads as a wrong token.
 */
describe("GET /.well-known/openai-apps-challenge", () => {
  const staticDirectory = process.cwd();

  it("returns the token, alone, as plain text", async () => {
    const app = createApp({ appsChallenge: "abc123-token", staticDirectory });

    const response = await request(app).get("/.well-known/openai-apps-challenge").expect(200);

    expect(response.text).toBe("abc123-token");
    expect(response.headers["content-type"]).toMatch(/text\/plain/);
  });

  it("says nothing is configured rather than handing over the application shell", async () => {
    const app = createApp({ staticDirectory });

    const response = await request(app).get("/.well-known/openai-apps-challenge").expect(404);

    expect(response.headers["content-type"]).toMatch(/text\/plain/);
    expect(response.text).not.toMatch(/<!doctype html>/i);
  });
});
