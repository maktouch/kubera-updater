import type { Page } from "playwright";
import { parseCurrencyValue } from "../utils/currency.js";

/**
 * MICA does not expose a book cost. We derive it from the full transaction
 * history: deposits are the only outside source of cash, so for each account
 *
 *   deposits = buys - sells - cash distributions + current cash balance
 *
 * Fees and reinvested distributions are settled in units and never touch cash.
 *
 * To guard against MICA truncating history, we reconcile units: for every fund,
 * bought - sold + reinvested + fee redemptions must equal the units held today.
 * If that fails the cost basis for the account is returned as null.
 */

export type MicaAccountKey = "CELI" | "REER";

export type MicaCostBasisResult = {
  celi: number | null;
  reer: number | null;
  warnings: string[];
};

type Transaction = {
  date: string;
  account: MicaAccountKey;
  code: string;
  type: string;
  units: number;
  net: number;
};

type Holdings = {
  cash: number;
  unitsByCode: Map<string, number>;
};

const BUY_TYPE = "ACHAT BRUT";
const SELL_TYPE = "VENTE BRUTE";
const CASH_DISTRIBUTION_TYPE = "DISTRIBUTION EN ESPECES";
const REINVESTED_DISTRIBUTION_TYPE = "DISTRIBUTION REINVESTIE";
const FEE_TYPE = "FRAIS";
const CASH_CODE = "SM CAN";
const UNIT_TOLERANCE = 0.01;
const MAX_TRANSACTION_PAGES = 200;

export async function extractMicaCostBasis(page: Page, timeoutMs: number): Promise<MicaCostBasisResult> {
  const warnings: string[] = [];

  const holdings = {
    CELI: await extractHoldings(page, "CELI", timeoutMs),
    REER: await extractHoldings(page, "REER", timeoutMs)
  };

  const transactions = await extractAllTransactions(page, timeoutMs);

  const result: MicaCostBasisResult = { celi: null, reer: null, warnings };
  for (const account of ["CELI", "REER"] as const) {
    const accountHoldings = holdings[account];
    if (!accountHoldings) {
      warnings.push(`${account}: could not read holdings page; cost basis skipped.`);
      continue;
    }

    const accountTransactions = transactions.filter((transaction) => transaction.account === account);
    const reconciliation = reconcileUnits(accountTransactions, accountHoldings);
    if (reconciliation.length > 0) {
      warnings.push(`${account}: unit reconciliation failed, cost basis skipped. ${reconciliation.join(" ")}`);
      continue;
    }

    const cost = computeDeposits(accountTransactions, accountHoldings.cash);
    if (account === "CELI") {
      result.celi = cost;
    } else {
      result.reer = cost;
    }
  }

  return result;
}

function computeDeposits(transactions: Transaction[], cash: number): number {
  let deposits = cash;
  for (const transaction of transactions) {
    const type = normalize(transaction.type);
    if (type.startsWith(BUY_TYPE)) {
      deposits += transaction.net;
    } else if (type.startsWith(SELL_TYPE)) {
      deposits -= Math.abs(transaction.net);
    } else if (type.startsWith(CASH_DISTRIBUTION_TYPE)) {
      deposits -= transaction.net;
    }
  }

  return Math.round(deposits * 100) / 100;
}

function reconcileUnits(transactions: Transaction[], holdings: Holdings): string[] {
  const computed = new Map<string, number>();
  for (const transaction of transactions) {
    const type = normalize(transaction.type);
    let delta = 0;
    if (type.startsWith(BUY_TYPE) || type.startsWith(REINVESTED_DISTRIBUTION_TYPE) || type.startsWith(FEE_TYPE)) {
      delta = transaction.units;
    } else if (type.startsWith(SELL_TYPE)) {
      delta = -Math.abs(transaction.units);
    } else if (type.startsWith(CASH_DISTRIBUTION_TYPE)) {
      delta = 0;
    } else {
      return [`Unknown transaction type "${transaction.type}" on ${transaction.date}.`];
    }

    computed.set(transaction.code, (computed.get(transaction.code) ?? 0) + delta);
  }

  const problems: string[] = [];
  const codes = new Set([...computed.keys(), ...holdings.unitsByCode.keys()]);
  for (const code of codes) {
    const expected = holdings.unitsByCode.get(code) ?? 0;
    const actual = computed.get(code) ?? 0;
    if (Math.abs(expected - actual) > UNIT_TOLERANCE) {
      problems.push(`${code}: held ${expected.toFixed(4)} but transactions sum to ${actual.toFixed(4)}.`);
    }
  }

  return problems;
}

async function extractHoldings(page: Page, account: MicaAccountKey, timeoutMs: number): Promise<Holdings | null> {
  await page.getByText("Comptes", { exact: true }).first().click();
  await page.waitForURL(/\/comptes/, { timeout: timeoutMs });

  const accountCard = page.getByText(account === "CELI" ? /CELI \(SM/ : /REÉR \(SM/).first();
  await accountCard.waitFor({ state: "visible", timeout: timeoutMs });
  await accountCard.click();
  await page.locator("mat-row").first().waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForTimeout(1500);

  const heading = await page.locator("body").innerText();
  const accountCode = heading.match(account === "CELI" ? /CELI \((SM\d+)\)/ : /REÉR \((SM\d+)\)/)?.[1];
  if (!accountCode || !new RegExp(`\\(${accountCode}\\)[\\s\\S]*Information du plan`).test(heading)) {
    return null;
  }

  const rows = await readRows(page);
  const unitsByCode = new Map<string, number>();
  let cash = 0;
  let sawAnyRow = false;
  for (const cells of rows) {
    if (cells.length < 5) {
      continue;
    }

    sawAnyRow = true;
    const [, code, units, , value] = cells;
    if (normalize(code) === CASH_CODE) {
      cash += parseCurrencyValue(value);
      continue;
    }

    unitsByCode.set(code, (unitsByCode.get(code) ?? 0) + parseCurrencyValue(units));
  }

  return sawAnyRow ? { cash, unitsByCode } : null;
}

async function extractAllTransactions(page: Page, timeoutMs: number): Promise<Transaction[]> {
  await page.getByText("Transactions", { exact: true }).first().click();
  await page.waitForURL(/\/transactions/, { timeout: timeoutMs });
  await page.locator("mat-row").first().waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForTimeout(1500);

  const transactions: Transaction[] = [];
  const seen = new Set<string>();

  for (let pageIndex = 0; pageIndex < MAX_TRANSACTION_PAGES; pageIndex++) {
    const rows = await readRows(page);
    for (const cells of rows) {
      if (cells.length < 10) {
        continue;
      }

      const key = cells.join("|");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const account = normalize(cells[1]).startsWith("CELI") ? "CELI" : normalize(cells[1]).startsWith("REER") ? "REER" : null;
      if (!account) {
        continue;
      }

      transactions.push({
        date: cells[0],
        account,
        code: cells[2],
        type: cells[3],
        units: parseCurrencyValue(cells[5]),
        net: parseCurrencyValue(cells[9])
      });
    }

    const pageInfo = (await page.locator("mat-paginator").first().innerText()).match(/Page (\d+) sur (\d+)/);
    if (!pageInfo || pageInfo[1] === pageInfo[2]) {
      break;
    }

    const next = page
      .locator("button.mat-mdc-paginator-navigation-next, button.mat-paginator-navigation-next, button[aria-label*='uivante']")
      .first();
    if (await next.isDisabled()) {
      break;
    }

    const firstRowBefore = rows[0]?.join("|") ?? "";
    await next.click();
    await page.waitForFunction(
      (previous) => {
        const row = document.querySelector("mat-row");
        if (!row) {
          return false;
        }
        const text = Array.from(row.querySelectorAll("mat-cell"))
          .map((cell) => (cell as HTMLElement).innerText.replace(/\s+/g, " ").trim())
          .join("|");
        return text !== previous;
      },
      firstRowBefore,
      { timeout: timeoutMs }
    );
    await page.waitForTimeout(500);
  }

  return transactions;
}

async function readRows(page: Page): Promise<string[][]> {
  return page.locator("mat-row").evaluateAll((rows) =>
    rows.map((row) =>
      Array.from(row.querySelectorAll("mat-cell")).map((cell) =>
        (cell as HTMLElement).innerText.replace(/\s+/g, " ").trim()
      )
    )
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toUpperCase();
}
