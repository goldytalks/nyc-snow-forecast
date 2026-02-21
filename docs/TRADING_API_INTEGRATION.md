# Automated Trading API Integration Guide

## Overview

This document outlines how to set up automated trading for the NYC Snow Forecast model using Kalshi and Polymarket APIs.

---

## Market Summary

### Event: February 21-24, 2026 NYC Blizzard

| Market | Date Range | Resolution Source |
|--------|------------|-------------------|
| **Kalshi** KXSNOWSTORM-26FEBNYC2 | Feb 21-24 (4 days) | NWS Daily Climate Report (CLINYC) |
| **Polymarket** | Feb 21-23 (3 days) | NOAA weather.gov/wrh/climate?wfo=okx |

### Current Model vs Market (as of Feb 21, 2026)

| Threshold | Our Model | Kalshi Market | Edge |
|-----------|-----------|---------------|------|
| >10" | 44.4% | ~72% | -27.6% (SELL) |
| >12" | 20.5% | ~61% | -40.5% (SELL) |
| >15" | 5.9% | ~37% | -31.1% (SELL) |

**Note:** Our model is significantly more conservative than the market. Either:
1. The market is overpriced (opportunity to sell)
2. Our model underestimates (need recalibration)
3. Market has information we don't have

---

## Kalshi API Integration

### Base URL
```
https://trading-api.kalshi.com/trade-api/v2
```

### Authentication
```python
# RSA-PSS signature required
# API Key ID + Private Key from Kalshi dashboard

import kalshi
from kalshi import ApiClient

configuration = kalshi.Configuration()
configuration.api_key['Authorization'] = 'YOUR_API_KEY'
api_client = ApiClient(configuration)
```

### Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/markets/{ticker}` | GET | Get market details |
| `/users/{user_id}/orders` | POST | Place order |
| `/users/{user_id}/orders/{order_id}` | DELETE | Cancel order |
| `/users/{user_id}/positions` | GET | Get positions |
| `/users/{user_id}/balance` | GET | Get balance |

### Order Placement Example
```python
from kalshi import UserApi, UserOrderCreateRequest

user_api = UserApi(api_client)

order = UserOrderCreateRequest(
    ticker="KXSNOWSTORM-26FEBNYC2-T10",  # >10" threshold
    action="sell",  # or "buy"
    side="no",  # or "yes"
    count=10,  # number of contracts
    type="limit",
    price=72  # cents (0.72 = 72%)
)

response = user_api.user_order_create(user_id="YOUR_USER_ID", request_body=order)
```

### Rate Limits
- REST API: ~50-200ms latency
- Rate limit: Returns 429 on excess
- Implement exponential backoff

---

## Polymarket API Integration

### Base URLs
```
CLOB API: https://clob.polymarket.com
Gamma API: https://gamma-api.polymarket.com
WebSocket: wss://ws-subscriptions-clob.polymarket.com
```

### Authentication
```python
from py_clob_client.client import ClobClient

# For trading (requires wallet private key)
client = ClobClient(
    "https://clob.polymarket.com",
    key="YOUR_PRIVATE_KEY",  # Ethereum private key
    chain_id=137,  # Polygon
    signature_type=0,  # EOA
    funder="YOUR_WALLET_ADDRESS"
)

# Derive API credentials
client.set_api_creds(client.create_or_derive_api_creds())
```

### Key Endpoints

| Method | Purpose |
|--------|---------|
| `get_simplified_markets()` | List markets |
| `get_price(token_id, side)` | Best price |
| `get_order_book(token_id)` | Orderbook |
| `create_order(OrderArgs)` | Create order |
| `post_order(signed, OrderType)` | Submit order |
| `cancel(order_id)` | Cancel order |
| `get_orders(OpenOrderParams)` | Active orders |

### Order Placement Example
```python
from py_clob_client.clob_types import OrderArgs, OrderType
from py_clob_client.order_builder.constants import BUY, SELL

# Create limit order
order = OrderArgs(
    token_id="TOKEN_ID_FOR_NYC_SNOW",
    price=0.50,  # 50 cents
    size=10.0,  # shares
    side=SELL  # or BUY
)

signed = client.create_order(order)
response = client.post_order(signed, OrderType.GTC)
```

### Token Allowances (First-Time Setup)
Before trading, approve:
- USDC: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- Conditional Tokens: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`

---

## Trading Bot Architecture

### Recommended Setup

```
┌─────────────────────────────────────────────────────────────┐
│                    Trading Bot                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Model     │  │   Market    │  │    Execution        │  │
│  │   Engine    │→ │   Scanner   │→ │    Engine           │  │
│  │             │  │             │  │                     │  │
│  │ - NWS Data  │  │ - Kalshi    │  │ - Order Placement   │  │
│  │ - Scenarios │  │ - Polymarket│  │ - Risk Management   │  │
│  │ - Probs     │  │ - Spreads   │  │ - Position Sizing   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Model Engine** (Already Built)
   - Fetches NWS data
   - Generates probability estimates
   - Outputs strike probabilities

2. **Market Scanner** (To Build)
   - Polls Kalshi/Polymarket prices
   - Computes edge (model prob - market price)
   - Identifies trading opportunities

3. **Execution Engine** (To Build)
   - Places orders when edge > threshold
   - Manages position sizing
   - Handles order fills/cancels
   - Risk management (max loss, etc.)

---

## Environment Variables Required

```bash
# Kalshi
KALSHI_API_KEY=your_api_key
KALSHI_PRIVATE_KEY_PATH=/path/to/private_key.pem
KALSHI_USER_ID=your_user_id

# Polymarket
POLYMARKET_PRIVATE_KEY=your_eth_private_key
POLYMARKET_WALLET_ADDRESS=0x...

# General
MIN_EDGE_THRESHOLD=0.05  # 5% edge to trade
MAX_POSITION_SIZE=100    # max contracts per threshold
```

---

## Risk Management

### Position Limits
- Max position per threshold: $100-500
- Max total exposure: $1000-2000
- Stop loss: Exit if model probability moves against position by >15%

### Edge Requirements
- Minimum edge to enter: 5%
- Scale in: 25% at 5% edge, 50% at 10% edge, 100% at 15% edge

### Pre-Trade Checklist
1. Verify NWS data is fresh (<3 hours old)
2. Check model vs market edge
3. Verify no existing position at threshold
4. Confirm sufficient balance

---

## Next Steps

1. **Get API Keys**
   - Kalshi: Settings → API → Create API Key
   - Polymarket: Set up Polygon wallet

2. **Set Up Trading Environment**
   ```bash
   pip install kalshi-python py-clob-client
   ```

3. **Create Trading Bot Script**
   - See `/scripts/trading-bot.py` (to be created)

4. **Paper Trade First**
   - Kalshi has a demo environment
   - Test order placement without real funds

---

## Sources

- [Kalshi API Docs](https://docs.kalshi.com/welcome)
- [Kalshi Help Center](https://help.kalshi.com/kalshi-api)
- [Polymarket CLOB Docs](https://docs.polymarket.com/developers/CLOB/introduction)
- [Polymarket Python Client](https://github.com/Polymarket/py-clob-client)
