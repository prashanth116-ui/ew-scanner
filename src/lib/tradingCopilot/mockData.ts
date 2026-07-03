import type { MockPreset, CopilotInput } from "./types";

export const MOCK_PRESETS: MockPreset[] = [
  {
    name: "ES Bull Setup",
    description: "High-conviction bullish ES setup with full alignment",
    input: {
      market: "ES",
      session: "ny_am",
      currentPrice: 5925.50,

      dailyBias: "bullish",
      fourHourBias: "bullish",
      oneHourBias: "bullish",
      fifteenMinBias: "bullish",

      pdaHighLevel: 5960,
      pdaLowLevel: 5880,
      nearestOBLevel: 5910,
      nearestFVGLevel: 5918,

      liquiditySweep: true,
      mss: true,
      displacement: true,
      fvgPresent: true,
      fvgRetest: true,
      inFVG: false,
      breaker: false,

      lossesToday: 0,
      consecutiveLosses: 0,
      openPositions: 0,
      lastTradeResult: "none",
      timeSinceLastLoss: 999,
      rrRatio: 3.5,

      manualBlock: false,
    } satisfies CopilotInput,
  },
  {
    name: "NQ Caution",
    description: "NQ with mixed signals — developing but not ready",
    input: {
      market: "NQ",
      session: "ny_am",
      currentPrice: 21350,

      dailyBias: "bullish",
      fourHourBias: "bullish",
      oneHourBias: "neutral",
      fifteenMinBias: "neutral",

      pdaHighLevel: 21500,
      pdaLowLevel: 21100,
      nearestOBLevel: 21280,
      nearestFVGLevel: 21320,

      liquiditySweep: false,
      mss: false,
      displacement: true,
      fvgPresent: true,
      fvgRetest: false,
      inFVG: false,
      breaker: false,

      lossesToday: 1,
      consecutiveLosses: 1,
      openPositions: 1,
      lastTradeResult: "loss",
      timeSinceLastLoss: 25,
      rrRatio: 2.5,

      manualBlock: false,
    } satisfies CopilotInput,
  },
  {
    name: "AAPL Blocked",
    description: "Range-bound with revenge guard triggered",
    input: {
      market: "SPY",
      session: "ny_pm",
      currentPrice: 588.50,

      dailyBias: "neutral",
      fourHourBias: "bearish",
      oneHourBias: "bullish",
      fifteenMinBias: "neutral",

      pdaHighLevel: 592,
      pdaLowLevel: 584,
      nearestOBLevel: 586,
      nearestFVGLevel: 590,

      liquiditySweep: false,
      mss: false,
      displacement: false,
      fvgPresent: false,
      fvgRetest: false,
      inFVG: false,
      breaker: false,

      lossesToday: 3,
      consecutiveLosses: 3,
      openPositions: 0,
      lastTradeResult: "loss",
      timeSinceLastLoss: 5,
      rrRatio: 1.2,

      manualBlock: false,
    } satisfies CopilotInput,
  },
];
