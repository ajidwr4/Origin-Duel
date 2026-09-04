import Fastify from "fastify";

function parsePort(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

const app = Fastify();

app.get("/healthz", async () => ({ status: "ok" }));

try {
  await app.listen({ host: "0.0.0.0", port: parsePort(process.env.PORT) });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
