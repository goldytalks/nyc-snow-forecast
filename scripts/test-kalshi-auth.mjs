import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

// Parse .env.local file
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = {};

let currentKey = "";
let currentValue = "";
let inMultiLine = false;

for (const line of envContent.split("\n")) {
  if (inMultiLine) {
    currentValue += "\n" + line;
    if (line.includes("-----END")) {
      // Remove surrounding quotes if present
      let finalValue = currentValue;
      if (finalValue.startsWith('"')) finalValue = finalValue.slice(1);
      if (finalValue.endsWith('"')) finalValue = finalValue.slice(0, -1);
      envVars[currentKey] = finalValue;
      inMultiLine = false;
    }
  } else if (line.startsWith("#") || line.trim() === "") {
    continue;
  } else {
    const eqIndex = line.indexOf("=");
    if (eqIndex > 0) {
      const key = line.slice(0, eqIndex);
      const value = line.slice(eqIndex + 1);

      if (value.includes("-----BEGIN")) {
        currentKey = key;
        currentValue = value;
        inMultiLine = true;
      } else {
        // Remove quotes
        let finalValue = value;
        if (finalValue.startsWith('"') && finalValue.endsWith('"')) {
          finalValue = finalValue.slice(1, -1);
        }
        envVars[key] = finalValue;
      }
    }
  }
}

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const apiKeyId = envVars.KALSHI_API_KEY_ID;
const privateKeyPem = envVars.KALSHI_PRIVATE_KEY;

console.log("API Key ID:", apiKeyId);
console.log("Private Key starts with:", privateKeyPem?.substring(0, 50));
console.log("Private Key ends with:", privateKeyPem?.substring(privateKeyPem.length - 50));

if (!apiKeyId || !privateKeyPem) {
  console.error("Missing credentials");
  process.exit(1);
}

function generateAuthHeaders(method, path) {
  const timestamp = Date.now().toString();
  const pathWithoutQuery = path.split("?")[0];
  const fullPath = `/trade-api/v2${pathWithoutQuery}`;
  const message = timestamp + method.toUpperCase() + fullPath;

  console.log("Signing message:", message);

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

async function testBalance() {
  try {
    const headers = generateAuthHeaders("GET", "/portfolio/balance");
    console.log("\nHeaders:", JSON.stringify(headers, null, 2));

    const res = await fetch(`${KALSHI_API_BASE}/portfolio/balance`, {
      method: "GET",
      headers,
    });

    console.log("\nResponse status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testBalance();
