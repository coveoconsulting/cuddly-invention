import { startServer } from "./server.ts";

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
