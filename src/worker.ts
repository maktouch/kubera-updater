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
  console.log(`CELI cost basis = ${formatCost(mica.celiCost)}`);
  console.log(`REER cost basis = ${formatCost(mica.reerCost)}`);
  for (const warning of mica.warnings) {
    console.warn(`MICA warning: ${warning}`);
  }

  const gopeer = await fetchGopeerTotalAccountValue({
    loginUrl: appConfig.GOPEER_LOGIN_URL,
    username: appConfig.GOPEER_USERNAME,
    password: appConfig.GOPEER_PASSWORD,
    timeoutMs: appConfig.PLAYWRIGHT_TIMEOUT_MS,
    headless: appConfig.BROWSER_HEADLESS
  });
  console.log(`Gopeer login succeeded. Final URL: ${gopeer.finalUrl}`);
  console.log(`GOPEER = ${gopeer.totalAccountValue.toFixed(2)}`);
  console.log(`GOPEER cost basis = ${formatCost(gopeer.netDeposits)}`);
  for (const warning of gopeer.warnings) {
    console.warn(`Gopeer warning: ${warning}`);
  }

  await syncKuberaBalances(
    {
      apiKey: appConfig.KUBERA_API_KEY,
      secret: appConfig.KUBERA_SECRET,
      portfolioId: appConfig.KUBERA_PORTFOLIO_ID
    },
    {
      "MICA - TFSA": { value: mica.celi, cost: mica.celiCost ?? undefined },
      "MICA - RRSP": { value: mica.reer, cost: mica.reerCost ?? undefined },
      Gopeer: { value: gopeer.totalAccountValue, cost: gopeer.netDeposits ?? undefined }
    }
  );
  console.log("Kubera assets updated: MICA - TFSA, MICA - RRSP, Gopeer");
}

function formatCost(cost: number | null): string {
  return cost === null ? "unknown (not updated)" : cost.toFixed(2);
}

run().catch((error: unknown) => {
  console.error("Worker failed:", error);
  process.exit(1);
});
