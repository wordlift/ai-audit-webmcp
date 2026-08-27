import express, { type Express } from "express";
import path from "node:path";

export interface AppOptions {
  staticDirectory?: string;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_request, response) => {
    response.status(200).json({ status: "ok", service: "ai-audit-webmcp" });
  });

  if (options.staticDirectory) {
    app.use(express.static(options.staticDirectory));
    app.get("*", (_request, response) => {
      response.sendFile(path.join(options.staticDirectory as string, "index.html"));
    });
  }

  return app;
}
