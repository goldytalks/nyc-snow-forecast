import crypto from "crypto";
import fs from "fs";
import path from "path";

// Load .env.local manually
const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");

// Parse env file (handles multi-line values in quotes)
const envVars: Record<string, string> = {};
const lines = envContent.split("\n");
let currentKey = "";
let currentValue = "";
let inMultiLine = false;

for (const line of lines) {
  if (inMultiLine) {
    currentValue += "\n" + line;
    if (line.includes('"') && line.trim().endsWith('"')) {
      envVars[currentKey] = currentValue.slice(1, -1); // Remove quotes
      inMultiLine = false;
    }
  } else {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      if (value.startsWith('"') && !value.endsWith('"')) {
        currentKey = key;
        currentValue = value;
        inMultiLine = true;
      } else {
        envVars[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }
}

// Set env vars
for (const [key, value] of Object.entries(envVars)) {
  process.env[key] = value;
}

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";

function generateAuthHeaders(
  method: string,
  path: string,
  apiKeyId: string,
  privateKeyPem: string
): Record<string, string> {
  const timestamp = Date.now().toString();
  const pathWithoutQuery = path.split("?")[0];
  const fullPath = `/trade-api/v2${pathWithoutQuery}`;
  const message = timestamp + method.toUpperCase() + fullPath;

  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign("sha256", Buffer.from(message), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });

  return {
    "KALSHI-ACCESS-KEY": apiKeyId,
    "KALSHI-ACCESS-SIGNATURE": signature.toString("base64"),
    "KALSHI-ACCESS-TIMESTAMP": timestamp,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function main() {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKey = process.env.KALSHI_PRIVATE_KEY;

  if (!apiKeyId || !privateKey) {
    console.log("ERROR: No API credentials found");
    console.log("KALSHI_API_KEY_ID:", apiKeyId ? "SET" : "NOT SET");
    console.log("KALSHI_PRIVATE_KEY:", privateKey ? "SET" : "NOT SET");
    return;
  }

  console.log("API Key ID:", apiKeyId.substring(0, 8) + "...");

  // Get balance
  try {
    const headers = generateAuthHeaders("GET", "/portfolio/balance", apiKeyId, privateKey);
    const res = await fetch(`${KALSHI_API_BASE}/portfolio/balance`, { headers });
    const data = await res.json();
    console.log("\n=== BALANCE ===");
    console.log(JSON.stringify(data, null, 2));
  } catch (e: any) {
    console.log("Balance error:", e.message);
  }

  // Get positions
  try {
    const headers = generateAuthHeaders("GET", "/portfolio/positions", apiKeyId, privateKey);
    const res = await fetch(`${KALSHI_API_BASE}/portfolio/positions`, { headers });
    const data = await res.json();
    console.log("\n=== POSITIONS ===");

    // Filter for snow markets
    const snowPositions = (data.market_positions || []).filter((p: any) =>
      p.ticker.includes("SNOW") && p.position !== 0
    );

    if (snowPositions.length === 0) {
      console.log("No active snow positions");
    } else {
      for (const pos of snowPositions) {
        console.log(`\nTicker: ${pos.ticker}`);
        console.log(`  Position: ${pos.position} contracts`);
        console.log(`  Market Exposure: $${(pos.market_exposure / 100).toFixed(2)}`);
        console.log(`  Total Traded: $${(pos.total_traded / 100).toFixed(2)}`);
        console.log(`  Realized P&L: $${(pos.realized_pnl / 100).toFixed(2)}`);
        console.log(`  Resting Orders: ${pos.resting_orders_count}`);
      }
    }
  } catch (e: any) {
    console.log("Positions error:", e.message);
  }
}

main();
