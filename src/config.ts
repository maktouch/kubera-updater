import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const EnvBoolean = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  return !["0", "false", "no"].includes(value.toLowerCase());
}, z.boolean());

const OptionalEnvString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}, z.string().min(1).optional());

const EnvSchema = z.object({
  KUBERA_API_KEY: z.string().min(1),
  KUBERA_SECRET: z.string().min(1),
  KUBERA_PORTFOLIO_ID: OptionalEnvString,
  MICA_USERNAME: z.string().min(1),
  MICA_PASSWORD: z.string().min(1),
  GOPEER_USERNAME: z.string().min(1),
  GOPEER_PASSWORD: z.string().min(1),
  MICA_LOGIN_URL: z.string().url().default("https://portailmica.com/login"),
  GOPEER_LOGIN_URL: z.string().url().default("https://my.gopeer.ca/auth/login"),
  PLAYWRIGHT_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  BROWSER_HEADLESS: EnvBoolean.default(true)
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`
  );
}

export const appConfig = parsed.data;
