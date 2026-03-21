import { chromium, type Page } from "playwright";
import { parseCurrencyValue } from "../utils/currency.js";

const USERNAME_SELECTORS = [
  "input#okta-signin-username",
  "input[name='identifier']",
  "input[name='username']",
  "input[type='email']"
];

const PASSWORD_SELECTORS = [
  "input#okta-signin-password",
  "input[name='credentials.passcode']",
  "input[name='password']",
  "input[type='password']"
];

const SUBMIT_SELECTORS = [
  "input#okta-signin-submit",
  "button[type='submit']",
  "input[type='submit']"
];

const LOGIN_ERROR_SELECTORS = [
  "[data-se='o-form-error-container']",
  ".o-form-error-container",
  ".okta-form-infobox-error"
];

export type MicaLoginConfig = {
  loginUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  headless: boolean;
};

export type MicaBalanceResult = {
  finalUrl: string;
  celi: number;
  reer: number;
};

export async function fetchMicaBalance(config: MicaLoginConfig): Promise<MicaBalanceResult> {
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(config.loginUrl, {
      timeout: config.timeoutMs,
      waitUntil: "domcontentloaded"
    });

    await fillFirstVisible(page, USERNAME_SELECTORS, config.username, config.timeoutMs);
    await fillFirstVisible(page, PASSWORD_SELECTORS, config.password, config.timeoutMs);
    await clickFirstVisible(page, SUBMIT_SELECTORS, config.timeoutMs);

    try {
      await page.waitForURL(/(client|advisors|admin)\.portailmica\.com/, {
        timeout: config.timeoutMs
      });
    } catch {
      const currentUrl = page.url();
      if (currentUrl.includes("id.portailmica.com")) {
        const loginError = await getFirstVisibleText(page, LOGIN_ERROR_SELECTORS);
        const extra = loginError ? ` Error from login page: "${loginError}".` : "";
        throw new Error(`MICA login did not complete. The flow is still on id.portailmica.com.${extra}`);
      }

      throw new Error(`MICA login did not complete. Final URL was "${currentUrl}".`);
    }

    const finalUrl = page.url();
    const balances = await extractNamedBalances(page, config.timeoutMs);
    if (balances.celi === null || balances.reer === null) {
      throw new Error(
        `Could not extract both CELI and REER from MICA dashboard. Extracted CELI=${balances.celi}, REER=${balances.reer}.`
      );
    }

    return {
      finalUrl,
      celi: balances.celi,
      reer: balances.reer
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function extractNamedBalances(
  page: Page,
  timeoutMs: number
): Promise<{ celi: number | null; reer: number | null }> {
  await page.locator("mat-row, tr").first().waitFor({ state: "visible", timeout: timeoutMs });
  const rowTexts = await page.locator("mat-row, tr").allTextContents();

  let celi: number | null = null;
  let reer: number | null = null;

  for (const rawRow of rowTexts) {
    const rowText = rawRow.replace(/\s+/g, " ").trim();
    if (!rowText) {
      continue;
    }

    const normalized = normalizeLabel(rowText);
    const currencyMatches = rowText.match(/-?\d[\d\s\u00A0\u202F.,]*\d\s*\$/g) ?? [];
    if (currencyMatches.length === 0) {
      continue;
    }

    const lastCurrency = currencyMatches[currencyMatches.length - 1];
    if (normalized.includes("CELI") && celi === null) {
      celi = parseCurrencyValue(lastCurrency);
      continue;
    }

    if (normalized.includes("REER") && reer === null) {
      reer = parseCurrencyValue(lastCurrency);
    }
  }

  return { celi, reer };
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

async function fillFirstVisible(
  page: Page,
  selectors: string[],
  value: string,
  timeoutMs: number
): Promise<void> {
  const selector = await findFirstVisibleSelector(page, selectors, timeoutMs);
  if (!selector) {
    throw new Error(`Could not find any visible input for selectors: ${selectors.join(", ")}`);
  }

  await page.locator(selector).first().fill(value);
}

async function clickFirstVisible(page: Page, selectors: string[], timeoutMs: number): Promise<void> {
  const selector = await findFirstVisibleSelector(page, selectors, timeoutMs);
  if (!selector) {
    throw new Error(`Could not find any visible button for selectors: ${selectors.join(", ")}`);
  }

  await page.locator(selector).first().click();
}

async function findFirstVisibleSelector(
  page: Page,
  selectors: string[],
  timeoutMs: number
): Promise<string | null> {
  const perSelectorTimeoutMs = Math.max(1000, Math.floor(timeoutMs / selectors.length));
  for (const selector of selectors) {
    try {
      await page.locator(selector).first().waitFor({
        state: "visible",
        timeout: perSelectorTimeoutMs
      });
      return selector;
    } catch {
      continue;
    }
  }

  return null;
}

async function getFirstVisibleText(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      const text = await locator.textContent();
      return text?.trim() ?? null;
    }
  }

  return null;
}
