import { createGameServer } from "../../server/index.js";

export default async function setup() {
  const server = await createGameServer();
  await new Promise((resolve, reject) => {
    server.http.once("error", reject);
    server.http.listen(0, "127.0.0.1", resolve);
  });
  process.env.FALLING_FLOOR_TEST_URL =
    "http://127.0.0.1:" + server.http.address().port;
  return () => server.close();
}
