/**
 * NWS Area Forecast Discussion (AFD) Parser
 * Extracts snowfall ranges, mixing info, SLR, QPF from AFD text
 */

export interface AFDExtraction {
  timestamp: string;
  issueTime: string | null;
  snowfallRange: {
    low: number;
    high: number;
    units: string;
  };
  localizedMax: number | null;
  mixingMentioned: boolean;
  mixingTiming: string | null;
  confidenceLanguage: string[];
  keyPhrases: string[];
  slrMentioned: { low: number; high: number } | null;
  qpfMentioned: number | null;
  rawExcerpts: string[];
}

const NWS_USER_AGENT = "(nyc-snow-forecast, contact@example.com)";

/**
 * Fetch the latest AFD from NWS
 */
export async function fetchLatestAFD(): Promise<string> {
  // First, get the list of recent AFDs
  const listUrl = "https://api.weather.gov/products/types/AFD/locations/OKX";

  const listResponse = await fetch(listUrl, {
    headers: {
      "User-Agent": NWS_USER_AGENT,
      Accept: "application/geo+json",
    },
    next: { revalidate: 900 }, // Cache for 15 minutes
  });

  if (!listResponse.ok) {
    throw new Error(`NWS AFD list error: ${listResponse.status}`);
  }

  const listData = await listResponse.json();
  const latestProductUrl = listData["@graph"]?.[0]?.["@id"];

  if (!latestProductUrl) {
    throw new Error("No AFD products found");
  }

  // Fetch the actual AFD text
  const afdResponse = await fetch(latestProductUrl, {
    headers: {
      "User-Agent": NWS_USER_AGENT,
      Accept: "application/geo+json",
    },
    next: { revalidate: 900 },
  });

  if (!afdResponse.ok) {
    throw new Error(`NWS AFD fetch error: ${afdResponse.status}`);
  }

  const afdData = await afdResponse.json();
  return afdData.productText || "";
}

/**
 * Parse AFD text to extract snowfall forecast parameters
 */
export function parseAFD(afdText: string): AFDExtraction {
  const extraction: AFDExtraction = {
    timestamp: new Date().toISOString(),
    issueTime: null,
    snowfallRange: { low: 0, high: 0, units: "inches" },
    localizedMax: null,
    mixingMentioned: false,
    mixingTiming: null,
    confidenceLanguage: [],
    keyPhrases: [],
    slrMentioned: null,
    qpfMentioned: null,
    rawExcerpts: [],
  };

  // Extract issue time
  const issueMatch = afdText.match(/(\d{3,4}\s*[AP]M\s*\w+\s+\w+\s+\w+\s+\d{1,2}\s+\d{4})/i);
  if (issueMatch) {
    extraction.issueTime = issueMatch[1];
  }

  // Extract snowfall range patterns
  // "widespread 8 to 14 inches"
  // "8 to 12 inches possible"
  // "expecting 10 to 15 inches"
  // "accumulations of 6 to 10 inches"
  const snowRangePatterns = [
    /(?:widespread|total|accumulations?\s*of|expecting|forecasting|currently\s*expecting)\s*(\d{1,2})\s*(?:to|-)\s*(\d{1,2})\s*inch/gi,
    /(\d{1,2})\s*(?:to|-)\s*(\d{1,2})\s*inch(?:es)?\s*(?:of\s*snow|snowfall|snow\s*accumulation|expected|possible|forecast)/gi,
  ];

  const allSnowMatches: Array<{ low: number; high: number }> = [];

  for (const pattern of snowRangePatterns) {
    const matches = [...afdText.matchAll(pattern)];
    for (const match of matches) {
      const low = parseInt(match[1]);
      const high = parseInt(match[2]);
      if (low > 0 && high > low && high <= 40) {
        allSnowMatches.push({ low, high });
        extraction.rawExcerpts.push(match[0]);
      }
    }
  }

  // Use the widest range found (most inclusive)
  if (allSnowMatches.length > 0) {
    extraction.snowfallRange.low = Math.min(...allSnowMatches.map(m => m.low));
    extraction.snowfallRange.high = Math.max(...allSnowMatches.map(m => m.high));
  }

  // Extract localized maximum
  // "approaching a foot and a half" = 18
  // "localized amounts up to 18 inches"
  // "locally higher amounts near 20"
  const localMaxPatterns = [
    /(?:localized|locally|isolated|up\s+to|approaching|perhaps\s+approaching)\s*(?:amounts?\s*)?(?:a\s+foot\s+and\s+a\s+half)/gi,
    /(?:localized|locally|isolated)\s*(?:amounts?\s*)?(?:up\s+to|near|of|approaching)\s*(\d{1,2})/gi,
    /(?:approaching|up\s+to)\s*(\d{1,2})\s*inch/gi,
  ];

  for (const pattern of localMaxPatterns) {
    const matches = [...afdText.matchAll(pattern)];
    for (const match of matches) {
      if (match[0].toLowerCase().includes("foot and a half")) {
        extraction.localizedMax = 18;
        extraction.rawExcerpts.push(match[0]);
      } else if (match[1]) {
        const val = parseInt(match[1]);
        if (val > (extraction.localizedMax || 0) && val <= 40) {
          extraction.localizedMax = val;
          extraction.rawExcerpts.push(match[0]);
        }
      }
    }
  }

  // Detect mixing language
  const mixingPatterns = [
    /mix(?:ing|ed)?\s*(?:with|to)?\s*(?:sleet|rain|freezing\s*rain)/gi,
    /sleet\s*(?:mix|mixing)/gi,
    /change(?:over)?\s*to\s*(?:sleet|rain|mix)/gi,
    /wintry\s*mix/gi,
    /transition(?:ing)?\s*to\s*(?:sleet|rain|mix)/gi,
    /rain\/snow\s*mix/gi,
  ];

  for (const pattern of mixingPatterns) {
    if (pattern.test(afdText)) {
      extraction.mixingMentioned = true;
      const match = afdText.match(pattern);
      if (match) extraction.rawExcerpts.push(match[0]);
    }
  }

  // Extract mixing timing
  const mixingTimePattern = /(?:mixing|sleet|changeover|transition)\s*(?:expected|forecast|beginning|starting)?\s*(?:by|around|Sunday|Monday|Saturday)?\s*(evening|night|afternoon|morning|late)/gi;
  const mixingTimeMatch = afdText.match(mixingTimePattern);
  if (mixingTimeMatch) {
    extraction.mixingTiming = mixingTimeMatch[0];
  }

  // Extract confidence language
  const confidencePatterns: Record<string, RegExp> = {
    high: /(?:high\s+confidence|confident|highly\s+likely|very\s+likely|certainly|assured)/gi,
    medium: /(?:moderate\s+confidence|fairly\s+confident|likely|probably|expected)/gi,
    low: /(?:low\s+confidence|uncertain|question(?:able)?|unclear|could\s+go\s+either\s+way)/gi,
  };

  for (const [level, pattern] of Object.entries(confidencePatterns)) {
    if (pattern.test(afdText)) {
      extraction.confidenceLanguage.push(level);
    }
  }

  // Extract SLR (snow-to-liquid ratio)
  // "15:1 to 10:1" or "15-18:1 early then 10:1"
  const slrPatterns = [
    /(\d{1,2})(?::1)?\s*(?:to|-)\s*(\d{1,2}):?1\s*(?:ratio|slr|snow\s*ratio)?/gi,
    /(?:slr|ratio|snow[- ]?to[- ]?liquid)\s*(?:of\s*)?(\d{1,2}):?1\s*(?:to|-)\s*(\d{1,2}):?1/gi,
  ];

  for (const pattern of slrPatterns) {
    const match = afdText.match(pattern);
    if (match) {
      const nums = match[0].match(/\d{1,2}/g);
      if (nums && nums.length >= 2) {
        const [first, second] = nums.map(n => parseInt(n));
        extraction.slrMentioned = {
          low: Math.min(first, second),
          high: Math.max(first, second),
        };
        extraction.rawExcerpts.push(match[0]);
        break;
      }
    }
  }

  // Extract QPF (liquid equivalent)
  const qpfPatterns = [
    /qpf\s*(?:of\s*)?(?:around|near|approximately|over)?\s*(\d+\.?\d*)\s*(?:inch|")/gi,
    /(?:liquid\s*equivalent|total\s*precipitation)\s*(?:of\s*)?(\d+\.?\d*)\s*(?:inch|")/gi,
    /(\d+\.?\d*)\s*(?:inch|")\s*(?:of\s*)?(?:liquid|qpf|precipitation)/gi,
  ];

  for (const pattern of qpfPatterns) {
    const match = afdText.match(pattern);
    if (match) {
      const numMatch = match[0].match(/(\d+\.?\d*)/);
      if (numMatch) {
        extraction.qpfMentioned = parseFloat(numMatch[1]);
        extraction.rawExcerpts.push(match[0]);
        break;
      }
    }
  }

  // Key phrases that affect probability
  const keyPhrasePatterns = [
    { pattern: /double\s*digit/gi, phrase: "double digit" },
    { pattern: /significant\s*(?:snowfall|accumulation|storm|impact)/gi, phrase: "significant" },
    { pattern: /major\s*(?:winter\s*)?storm/gi, phrase: "major storm" },
    { pattern: /heavy\s*(?:snow\s*)?at\s*times/gi, phrase: "heavy at times" },
    { pattern: /1\s*(?:to\s*)?2\s*in(?:ch)?(?:es)?\/(?:hr|hour)/gi, phrase: "1-2 in/hr rates" },
    { pattern: /blizzard/gi, phrase: "blizzard" },
    { pattern: /historic/gi, phrase: "historic" },
    { pattern: /impactful/gi, phrase: "impactful" },
    { pattern: /dangerous/gi, phrase: "dangerous" },
  ];

  for (const { pattern, phrase } of keyPhrasePatterns) {
    if (pattern.test(afdText)) {
      extraction.keyPhrases.push(phrase);
    }
  }

  return extraction;
}

/**
 * Fetch and parse the latest AFD in one call
 */
export async function fetchAndParseAFD(): Promise<AFDExtraction> {
  const afdText = await fetchLatestAFD();
  return parseAFD(afdText);
}
