import "dotenv/config";
import { createApp } from "./app.js";
import prisma from "./lib/prisma.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

const server = app.listen(port, () => {
  console.log(`Qudrat LMS API listening on http://localhost:${port}/api`);
});

const shutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
