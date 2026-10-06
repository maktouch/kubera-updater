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
  /** Net deposits (deposits minus withdrawals), derived as Total Account Value minus Net Income. Null if Net Income could not be read. */
  netDeposits: number | null;
  warnings: string[];
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
    const warnings: string[] = [];
    const netDeposits = await extractNetDeposits(page, totalAccountValue, warnings);
    return {
      finalUrl: page.url(),
      totalAccountValue,
      netDeposits,
      warnings
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function extractTotalAccountValue(page: Page, timeoutMs: number): Promise<number> {
  await page
    .getByText("Total Account Value")
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs });

  const totalRow = page.locator("tr", { hasText: "Total Account Value" }).first();
  if ((await totalRow.count()) > 0) {
    const totalRowText = (await totalRow.textContent())?.replace(/\s+/g, " ").trim() ?? "";
    const rowCurrencyMatches = totalRowText.match(/\$\s*[\d,]+\.\d{2}/g) ?? [];
    if (rowCurrencyMatches.length > 0) {
      return parseCurrencyValue(rowCurrencyMatches[rowCurrencyMatches.length - 1]);
    }
  }

  const pageText = await page.locator("body").innerText();
  const fallbackMatch = pageText.match(/Total Account Value[\s\S]{0,80}?\$\s*([\d,]+\.\d{2})/i);
  if (fallbackMatch?.[1]) {
    return parseCurrencyValue(fallbackMatch[1]);
  }

  throw new Error("Could not extract Gopeer Total Account Value from dashboard.");
}

/**
 * Gopeer defines Simple Return as the change in account value relative to net
 * deposits (deposits minus withdrawals), and shows Net Income on the dashboard.
 * Net deposits therefore equal Total Account Value minus Net Income.
 */
async function extractNetDeposits(
  page: Page,
  totalAccountValue: number,
  warnings: string[]
): Promise<number | null> {
  const pageText = await page.locator("body").innerText();
  const netIncomeMatch = pageText.match(/Net Income[\s\S]{0,80}?(-?)\$\s*([\d,]+\.\d{2})/i);
  if (!netIncomeMatch) {
    warnings.push("Could not read Net Income from Gopeer dashboard; cost basis skipped.");
    return null;
  }

  const netIncome = (netIncomeMatch[1] === "-" ? -1 : 1) * parseCurrencyValue(netIncomeMatch[2]);
  const netDeposits = Math.round((totalAccountValue - netIncome) * 100) / 100;
  if (netDeposits <= 0) {
    warnings.push(`Derived Gopeer net deposits ${netDeposits.toFixed(2)} is not positive; cost basis skipped.`);
    return null;
  }

  return netDeposits;
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
