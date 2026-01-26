/**
 * Debug endpoint to test Kalshi auth
 */

import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";

export async function GET() {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKeyPem = process.env.KALSHI_PRIVATE_KEY;

  const debug: any = {
    hasApiKey: !!apiKeyId,
    apiKeyId: apiKeyId || "NOT SET",
    hasPrivateKey: !!privateKeyPem,
    privateKeyStart: privateKeyPem?.substring(0, 60) || "NOT SET",
    privateKeyEnd: privateKeyPem?.substring(privateKeyPem.length - 60) || "NOT SET",
    privateKeyLength: privateKeyPem?.length || 0,
    privateKeyLines: privateKeyPem?.split("\n").length || 0,
  };

  if (!apiKeyId || !privateKeyPem) {
    return NextResponse.json({ error: "Missing credentials", debug });
  }

  // Test signing
  const timestamp = Date.now().toString();
  const method = "GET";
  const path = "/portfolio/balance";
  const fullPath = `/trade-api/v2${path}`;
  const message = timestamp + method + fullPath;

  debug.signMessage = message;

  try {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    debug.keyCreated = true;

    const signature = crypto.sign("sha256", Buffer.from(message), {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });
    debug.signatureCreated = true;
    debug.signatureBase64 = signature.toString("base64").substring(0, 50) + "...";

    const headers = {
      "KALSHI-ACCESS-KEY": apiKeyId,
      "KALSHI-ACCESS-SIGNATURE": signature.toString("base64"),
      "KALSHI-ACCESS-TIMESTAMP": timestamp,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Make the request
    const response = await fetch(`${KALSHI_API_BASE}${path}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    debug.responseStatus = response.status;
    debug.responseStatusText = response.statusText;

    const responseText = await response.text();
    debug.responseBody = responseText;

    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = null;
    }

    return NextResponse.json({
      success: response.ok,
      debug,
      response: responseJson,
    });
  } catch (error: any) {
    debug.error = error.message;
    debug.errorStack = error.stack;
    return NextResponse.json({ error: "Auth test failed", debug });
  }
}
