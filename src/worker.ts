import { appConfig } from "./config.js";
import { syncKuberaBalances } from "./kubera.js";
import { fetchGopeerTotalAccountValue } from "./platforms/gopeer.js";
import { fetchMicaBalance } from "./platforms/mica.js";

async function run(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Starting daily sync job`);

  const mica = await fetchMicaBalance({
    loginUrl: appConfig.MICA_LOGIN_URL,
    username: appConfig.MICA_USERNAME,
    password: appConfig.MICA_PASSWORD,
    timeoutMs: appConfig.PLAYWRIGHT_TIMEOUT_MS,
    headless: appConfig.BROWSER_HEADLESS
  });

  console.log(`MICA login succeeded. Final URL: ${mica.finalUrl}`);
  console.log(`CELI = ${mica.celi.toFixed(2)}`);
  console.log(`REER = ${mica.reer.toFixed(2)}`);

  const gopeer = await fetchGopeerTotalAccountValue({
    loginUrl: appConfig.GOPEER_LOGIN_URL,
    username: appConfig.GOPEER_USERNAME,
    password: appConfig.GOPEER_PASSWORD,
    timeoutMs: appConfig.PLAYWRIGHT_TIMEOUT_MS,
    headless: appConfig.BROWSER_HEADLESS
  });
  console.log(`Gopeer login succeeded. Final URL: ${gopeer.finalUrl}`);
  console.log(`GOPEER = ${gopeer.totalAccountValue.toFixed(2)}`);

  await syncKuberaBalances(
    {
      apiKey: appConfig.KUBERA_API_KEY,
      secret: appConfig.KUBERA_SECRET,
      portfolioId: appConfig.KUBERA_PORTFOLIO_ID
    },
    {
      CELI: mica.celi,
      REER: mica.reer,
      Gopeer: gopeer.totalAccountValue
    }
  );
  console.log("Kubera assets updated: CELI, REER, Gopeer");
}

run().catch((error: unknown) => {
  console.error("Worker failed:", error);
  process.exit(1);
});
