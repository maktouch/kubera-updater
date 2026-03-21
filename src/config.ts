import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const EnvSchema = z.object({
  SOURCE_API_URL: z.string().url(),
  DEST_API_URL: z.string().url(),
  DEST_API_KEY: z.string().min(1),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000)
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`
  );
}

export const appConfig = parsed.data;
