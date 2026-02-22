/**
 * Polymarket CLOB API Trading Test
 *
 * Tests automated order placement and cancellation via the Polymarket CLOB API.
 * Places a small limit order well below market bid (won't fill), then cancels it.
 *
 * Requirements:
 * - POLYMARKET_PRIVATE_KEY env var (Ethereum wallet private key)
 * - ethers.js installed (`npm install ethers`)
 *
 * Usage:
 *   npx ts-node scripts/polymarket-trade-test.ts
 *
 * CLOB API docs: https://docs.polymarket.com/#clob-api
 */

import { ethers } from "ethers";

const CLOB_API_BASE = "https://clob.polymarket.com";

// NYC Snow event slug (correct event with <8", 8-10", etc.)
const EVENT_SLUG = "how-many-inches-of-snow-in-nyc-this-weekend-february-21-23-273";
const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

interface ApiCreds {
  apiKey: string;
  secret: string;
  passphrase: string;
}

interface OrderResponse {
  orderID: string;
  status: string;
  [key: string]: unknown;
}

/**
 * Step 1: Derive API credentials from wallet signature
 */
async function deriveApiKey(wallet: ethers.Wallet): Promise<ApiCreds> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = 0;

  // Create the message to sign for API key derivation
  const message = `${timestamp}${nonce}`;
  const signature = await wallet.signMessage(message);

  const response = await fetch(`${CLOB_API_BASE}/auth/derive-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timestamp,
      nonce,
      signature,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to derive API key: ${response.status} ${text}`);
  }

  const data = await response.json();
  return {
    apiKey: data.apiKey,
    secret: data.secret,
    passphrase: data.passphrase,
  };
}

/**
 * Create L1 authentication headers for CLOB API
 */
function createL1Headers(
  creds: ApiCreds,
  method: string,
  path: string,
  body?: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = timestamp + method.toUpperCase() + path + (body || "");

  const hmac = ethers.computeHmac(
    "sha256",
    ethers.getBytes(Buffer.from(creds.secret, "base64")),
    ethers.toUtf8Bytes(message)
  );
  const signature = Buffer.from(ethers.getBytes(hmac)).toString("base64");

  return {
    "POLY-API-KEY": creds.apiKey,
    "POLY-SIGNATURE": signature,
    "POLY-TIMESTAMP": timestamp,
    "POLY-PASSPHRASE": creds.passphrase,
    "Content-Type": "application/json",
  };
}

/**
 * Step 2: Get a token ID for one of the snow market outcomes
 */
async function getSnowMarketToken(): Promise<{
  tokenId: string;
  question: string;
  currentPrice: number;
}> {
  const url = `${GAMMA_API_BASE}/events?slug=${encodeURIComponent(EVENT_SLUG)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch event: ${response.status}`);
  }

  const events = await response.json();
  const event = events[0];
  if (!event || !event.markets || event.markets.length === 0) {
    throw new Error("No markets found for event");
  }

  // Pick the first market with a token ID
  for (const market of event.markets) {
    const tokenIds =
      typeof market.clobTokenIds === "string"
        ? JSON.parse(market.clobTokenIds)
        : market.clobTokenIds || [];

    if (tokenIds.length > 0) {
      const prices = market.outcomePrices
        ? typeof market.outcomePrices === "string"
          ? JSON.parse(market.outcomePrices)
          : market.outcomePrices
        : ["0"];

      return {
        tokenId: tokenIds[0],
        question: market.question || market.groupItemTitle || "Unknown",
        currentPrice: parseFloat(prices[0] || "0"),
      };
    }
  }

  throw new Error("No market with CLOB token IDs found");
}

/**
 * Step 3: Place a test limit order (1 share, well below bid)
 */
async function placeTestOrder(
  creds: ApiCreds,
  tokenId: string,
  price: number
): Promise<OrderResponse> {
  const path = "/order";
  const orderPayload = {
    tokenID: tokenId,
    price: price.toFixed(2),
    size: "1",
    side: "BUY",
    type: "GTC", // Good Till Cancelled
  };

  const body = JSON.stringify(orderPayload);
  const headers = createL1Headers(creds, "POST", path, body);

  const response = await fetch(`${CLOB_API_BASE}${path}`, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to place order: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Step 4: Cancel the order
 */
async function cancelOrder(
  creds: ApiCreds,
  orderId: string
): Promise<void> {
  const path = "/order";
  const body = JSON.stringify({ orderID: orderId });
  const headers = createL1Headers(creds, "DELETE", path, body);

  const response = await fetch(`${CLOB_API_BASE}${path}`, {
    method: "DELETE",
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to cancel order: ${response.status} ${text}`);
  }
}

/**
 * Main test flow
 */
async function main() {
  console.log("=== Polymarket CLOB Trading Test ===\n");

  // Check for private key
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  if (!privateKey) {
    console.error("ERROR: Set POLYMARKET_PRIVATE_KEY env var");
    console.error("  export POLYMARKET_PRIVATE_KEY=0x...");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey);
  console.log(`Wallet: ${wallet.address}`);

  // Step 1: Derive API key
  console.log("\n1. Deriving API credentials...");
  let creds: ApiCreds;
  try {
    creds = await deriveApiKey(wallet);
    console.log(`   API Key: ${creds.apiKey.substring(0, 12)}...`);
    console.log("   OK");
  } catch (error) {
    console.error("   FAILED:", (error as Error).message);
    process.exit(1);
  }

  // Step 2: Get market token
  console.log("\n2. Fetching snow market token...");
  let tokenId: string;
  let question: string;
  let currentPrice: number;
  try {
    const result = await getSnowMarketToken();
    tokenId = result.tokenId;
    question = result.question;
    currentPrice = result.currentPrice;
    console.log(`   Market: ${question}`);
    console.log(`   Token ID: ${tokenId.substring(0, 20)}...`);
    console.log(`   Current price: ${(currentPrice * 100).toFixed(1)}c`);
    console.log("   OK");
  } catch (error) {
    console.error("   FAILED:", (error as Error).message);
    process.exit(1);
  }

  // Step 3: Place test order at 1c (well below any reasonable bid)
  const testPrice = 0.01;
  console.log(`\n3. Placing test order: BUY 1 share @ ${(testPrice * 100).toFixed(0)}c...`);
  let orderId: string;
  try {
    const result = await placeTestOrder(creds, tokenId, testPrice);
    orderId = result.orderID;
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Status: ${result.status}`);
    console.log("   OK");
  } catch (error) {
    console.error("   FAILED:", (error as Error).message);
    process.exit(1);
  }

  // Step 4: Cancel immediately
  console.log("\n4. Cancelling test order...");
  try {
    await cancelOrder(creds, orderId);
    console.log("   OK — order cancelled");
  } catch (error) {
    console.error("   FAILED:", (error as Error).message);
    console.error("   WARNING: Order may still be open at 1c — check Polymarket UI");
    process.exit(1);
  }

  console.log("\n=== TEST PASSED ===");
  console.log("Successfully placed and cancelled a test order on Polymarket CLOB.");
  console.log("Trading infrastructure is working.");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
