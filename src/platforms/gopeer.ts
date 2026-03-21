import { chromium, type Page } from "playwright";
import { parseCurrencyValue } from "../utils/currency.js";

const USERNAME_SELECTORS = [
  "input[type='email']",
  "input[name='email']",
  "input[name='username']",
  "input[autocomplete='username']"
];

const PASSWORD_SELECTORS = [
  "input[type='password']",
  "input[name='password']",
  "input[autocomplete='current-password']"
];

const SUBMIT_SELECTORS = [
  "button[type='submit']",
  "input[type='submit']",
  "button:has-text('Log in')",
  "button:has-text('Login')",
  "button:has-text('Sign in')"
];

export type GopeerLoginConfig = {
  loginUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  headless: boolean;
};

export type GopeerBalanceResult = {
  finalUrl: string;
  totalAccountValue: number;
};

export async function fetchGopeerTotalAccountValue(
  config: GopeerLoginConfig
): Promise<GopeerBalanceResult> {
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(config.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.timeoutMs
    });

    await fillFirstVisible(page, USERNAME_SELECTORS, config.username, config.timeoutMs);
    await fillFirstVisible(page, PASSWORD_SELECTORS, config.password, config.timeoutMs);
    await clickFirstVisible(page, SUBMIT_SELECTORS, config.timeoutMs);

    await page.waitForURL(/my\.gopeer\.ca\/investor\/dashboard/, {
      timeout: config.timeoutMs
    });

    const totalAccountValue = await extractTotalAccountValue(page, config.timeoutMs);
    return {
      finalUrl: page.url(),
      totalAccountValue
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function extractTotalAccountValue(page: Page, timeoutMs: number): Promise<number> {
  const totalRow = page.locator("div.row.font-size-sm", { hasText: "Total Account Value" }).first();
  await totalRow.waitFor({ state: "visible", timeout: timeoutMs });
  const totalRowText = (await totalRow.textContent())?.replace(/\s+/g, " ").trim() ?? "";
  const rowCurrencyMatches = totalRowText.match(/\$\s*[\d,]+\.\d{2}/g) ?? [];

  if (rowCurrencyMatches.length > 0) {
    return parseCurrencyValue(rowCurrencyMatches[rowCurrencyMatches.length - 1]);
  }

  const pageText = await page.locator("body").innerText();
  const fallbackMatch = pageText.match(/Total Account Value[^\n]*\$\s*([\d,]+\.\d{2})/i);
  if (fallbackMatch?.[1]) {
    return parseCurrencyValue(fallbackMatch[1]);
  }

  throw new Error("Could not extract Gopeer Total Account Value from dashboard.");
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
