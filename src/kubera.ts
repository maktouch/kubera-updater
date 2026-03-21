import crypto from "node:crypto";

const KUBERA_API_BASE_URL = "https://api.kubera.com";

type KuberaConfig = {
  apiKey: string;
  secret: string;
  portfolioId?: string;
};

type PortfolioListResponse = {
  data: Array<{
    id: string;
    name: string;
    currency: string;
  }>;
  errorCode: number;
};

type PortfolioDataResponse = {
  data: {
    id: string;
    name: string;
    asset: Array<{
      id: string;
      name: string;
    }>;
  };
  errorCode: number;
};

type UpdateItemResponse = {
  errorCode: number;
};

export async function syncKuberaBalances(
  config: KuberaConfig,
  assetValues: Record<string, number>
): Promise<void> {
  const portfolioId = config.portfolioId ?? (await getDefaultPortfolioId(config));
  const portfolioData = await kuberaRequest<PortfolioDataResponse>(
    config,
    "GET",
    `/api/v3/data/portfolio/${portfolioId}`
  );

  for (const [assetName, value] of Object.entries(assetValues)) {
    const targetAsset = findAssetByName(portfolioData.data.asset, assetName);
    if (!targetAsset) {
      const available = portfolioData.data.asset.slice(0, 100).map((asset) => asset.name).join(", ");
      throw new Error(
        `Could not find Kubera asset "${assetName}" in portfolio "${portfolioData.data.name}". Available assets: ${available}`
      );
    }

    await kuberaRequest<UpdateItemResponse>(config, "POST", `/api/v3/data/item/${targetAsset.id}`, {
      value
    });
  }
}

async function getDefaultPortfolioId(config: KuberaConfig): Promise<string> {
  const list = await kuberaRequest<PortfolioListResponse>(config, "GET", "/api/v3/data/portfolio");
  if (!list.data.length) {
    throw new Error("No Kubera portfolio found for this API key.");
  }

  return list.data[0].id;
}

async function kuberaRequest<T>(
  config: KuberaConfig,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyData = body ? JSON.stringify(body) : "";
  const signaturePayload = `${config.apiKey}${timestamp}${method}${path}${bodyData}`;
  const signature = crypto.createHmac("sha256", config.secret).update(signaturePayload).digest("hex");

  const response = await fetch(`${KUBERA_API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-token": config.apiKey,
      "x-timestamp": timestamp,
      "x-signature": signature
    },
    body: bodyData || undefined
  });

  if (!response.ok) {
    throw new Error(`Kubera API request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function findAssetByName(
  assets: Array<{ id: string; name: string }>,
  targetName: string
): { id: string; name: string } | undefined {
  const normalizedTarget = normalizeName(targetName);
  const exact = assets.find((asset) => normalizeName(asset.name) === normalizedTarget);
  if (exact) {
    return exact;
  }

  return assets.find((asset) => normalizeName(asset.name).includes(normalizedTarget));
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toUpperCase();
}
