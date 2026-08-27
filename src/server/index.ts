import path from "node:path";
import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = createApp({ staticDirectory: path.resolve(process.cwd(), "dist") });

const server = app.listen(port, () => {
  console.log(`WordLift AI Audit WebMCP listening on ${port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received; closing HTTP server`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
