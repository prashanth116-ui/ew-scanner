"use client";

import {
  LayerSection,
  ConceptCard,
  ExampleBox,
  MistakeBox,
  TakeawayBox,
  MiniDiagram,
  TableOfContents,
  ProgressBar,
} from "@/components/price-action";
import type { TocItem } from "@/components/price-action";

const tocItems: TocItem[] = [
  { id: "layer-1", number: 1, title: "What Price Action Really Is", difficulty: "beginner" },
  { id: "layer-2", number: 2, title: "Basic Market Structure", difficulty: "beginner" },
  { id: "layer-3", number: 3, title: "PD Arrays", difficulty: "beginner" },
  { id: "layer-4", number: 4, title: "Reading PDA Strength", difficulty: "beginner" },
  { id: "layer-5", number: 5, title: "Multi-Timeframe Reading", difficulty: "beginner" },
  { id: "layer-6", number: 6, title: "Liquidity Mapping", difficulty: "beginner" },
  { id: "layer-7", number: 7, title: "Market State", difficulty: "beginner" },
  { id: "layer-8", number: 8, title: "Auction Market Theory", difficulty: "intermediate" },
  { id: "layer-9", number: 9, title: "Sophisticated Candle Reading", difficulty: "intermediate" },
  { id: "layer-10", number: 10, title: "Trapped Traders", difficulty: "intermediate" },
  { id: "layer-11", number: 11, title: "Acceptance vs Rejection", difficulty: "intermediate" },
  { id: "layer-12", number: 12, title: "Time-Based Price Action", difficulty: "intermediate" },
  { id: "layer-13", number: 13, title: "ES vs NQ Relative Strength", difficulty: "intermediate" },
  { id: "layer-14", number: 14, title: "Advanced Auction Behavior", difficulty: "advanced" },
  { id: "layer-15", number: 15, title: "Market Microstructure", difficulty: "advanced" },
  { id: "layer-16", number: 16, title: "Inventory Theory", difficulty: "advanced" },
  { id: "layer-17", number: 17, title: "Dealer Hedging", difficulty: "advanced" },
  { id: "layer-18", number: 18, title: "Volatility Regimes", difficulty: "advanced" },
  { id: "layer-19", number: 19, title: "Flow Analysis", difficulty: "advanced" },
  { id: "layer-20", number: 20, title: "Reflexivity", difficulty: "advanced" },
  { id: "layer-21", number: 21, title: "Positioning Dynamics", difficulty: "institutional" },
  { id: "layer-22", number: 22, title: "Game Theory", difficulty: "institutional" },
  { id: "layer-23", number: 23, title: "Adaptive Systems", difficulty: "institutional" },
  { id: "layer-24", number: 24, title: "Professional Price Action Framework", difficulty: "institutional" },
  { id: "layer-25", number: 25, title: "Practical Trading Copilot Rules", difficulty: "institutional" },
];

export function PriceActionContent() {
  return (
    <div className="flex gap-8">
      {/* TOC — sticky sidebar on desktop, floating button on mobile */}
      <TableOfContents items={tocItems} />

      {/* Main content */}
      <div className="min-w-0 flex-1">
        {/* Hero */}
        <div className="mb-10">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Price Action Mastery
          </h1>
          <p className="mb-1 text-lg text-[#a0a0a0]">
            From Beginner to Institutional-Level Market Reading
          </p>
          <p className="text-sm text-[#666]">
            25 layers &middot; Beginner to institutional &middot; Examples on ES, NQ, and equities
          </p>
        </div>

        <ProgressBar current={25} total={25} />

        <div className="mt-10 space-y-2">
          {/* ═══════════════════════════════════════════════════════
             LAYER 1 — What Price Action Really Is
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-1" number={1} title="What Price Action Really Is" difficulty="beginner">
            <ConceptCard title="Beyond Candles">
              <p>
                Most traders think price action means reading candlestick patterns. That is a fraction of the picture. Price action is the visible footprint of every decision made by every participant in the market — from a retail trader clicking buy on their phone to a pension fund rebalancing billions.
              </p>
              <p>
                What you see on the chart is the result of liquidity, inventory, positioning, volatility, time, participant behavior, and forced decisions. A green candle is not simply &ldquo;buyers winning.&rdquo; It may be short covering. It may be a dealer hedging. It may be a stop cascade forcing people out of positions they wanted to keep.
              </p>
            </ConceptCard>

            <ConceptCard title="Why It Matters">
              <p>
                If you read price action only as patterns — hammer, engulfing, doji — you are reading the cover of a book and guessing the plot. Real price action reading means understanding the story: who is acting, why they are acting, and what is likely to happen next based on the structural context.
              </p>
            </ConceptCard>

            <MiniDiagram title="What Creates Price Action">
{`┌─────────────┐   ┌──────────────┐   ┌───────────────┐
│  Liquidity   │   │  Inventory   │   │  Positioning  │
│  (who wants  │   │  (who holds  │   │  (who must    │
│   to trade)  │   │   what)      │   │   act)        │
└──────┬───────┘   └──────┬───────┘   └───────┬───────┘
       │                  │                    │
       └──────────────────┼────────────────────┘
                          ▼
              ┌───────────────────────┐
              │    PRICE ACTION       │
              │  (what you see on     │
              │   the chart)          │
              └───────────────────────┘`}
            </MiniDiagram>

            <ExampleBox symbol="ES" title="A Green Candle That Was Not Bullish">
              <p>
                ES drops 30 points in the morning. At 10:15, a large green candle appears. New traders see it and think &ldquo;reversal.&rdquo; But what actually happened? Shorts who entered at the open are taking profit. That buying pressure is temporary — once they are done covering, there are no new buyers. Price rolls over and makes a new low 20 minutes later.
              </p>
              <p>
                The candle looked bullish. The context was bearish. That is why reading candles without understanding context leads to losses.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Treating every green candle as bullish and every red candle as bearish. Color tells you where price closed relative to where it opened — nothing more. The context around the candle determines its meaning.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Price action is not about candle patterns. It is about understanding what the market is telling you through the combination of price, context, and structure.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Every price move is the result of an information asymmetry or a forced action. Your job is to figure out which one is happening and position accordingly.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 2 — Basic Market Structure
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-2" number={2} title="Basic Market Structure" difficulty="beginner">
            <ConceptCard title="Higher Highs and Higher Lows">
              <p>
                An uptrend is defined by a series of higher highs (each peak is above the previous peak) and higher lows (each dip holds above the previous dip). Think of it like climbing stairs — each step is higher than the last.
              </p>
              <p>
                A downtrend is the opposite: lower highs and lower lows. Each rally fails below the previous rally, and each drop goes deeper than the last.
              </p>
            </ConceptCard>

            <MiniDiagram title="Market Structure">
{`  UPTREND                    DOWNTREND
                            HH
  HH                        /\\
  /\\      HH               /  \\  LH
 /  \\    /  \\             /    \\/\\
/    \\  /    \\   HL              \\  LH
      \\/      \\ /                 \\/\\
       HL      HL                    \\  LL
                                      \\/
                                       LL`}
            </MiniDiagram>

            <ConceptCard title="Range (Consolidation)">
              <p>
                When price stops making higher highs or lower lows and instead bounces between a ceiling and a floor, you are in a range. Ranges are where the market is deciding. Neither buyers nor sellers have control. About 70% of the time, the market is in some form of consolidation.
              </p>
              <p>
                <strong>Analogy:</strong> Think of a range like a tug-of-war where both sides are equally strong. Nobody is winning yet. The rope just moves back and forth until one side brings in reinforcements.
              </p>
            </ConceptCard>

            <ConceptCard title="Transition">
              <p>
                Transition is the point where the market changes character. An uptrend that makes a lower high for the first time is potentially transitioning. A range that breaks out with conviction is transitioning into a trend.
              </p>
              <p>
                Recognizing transitions early is one of the highest-value skills in trading because it lets you position before the crowd confirms what happened.
              </p>
            </ConceptCard>

            <ConceptCard title="Trend vs Chop">
              <p>
                A trending market moves in one direction with clear structure. A choppy market reverses constantly, trapping traders in both directions. The biggest mistake beginners make is treating a choppy market like a trending one.
              </p>
            </ConceptCard>

            <ExampleBox symbol="NQ" title="Why 5M Alone Causes FOMO">
              <p>
                On the 5-minute chart, NQ drops 50 points, then a large green candle appears. It looks like a reversal. You buy. But if you had checked the 1-hour chart, you would see that the overall structure is bearish — this green candle is just a minor pullback inside a larger downmove. You entered at the worst possible location: the pullback high in a downtrend.
              </p>
              <p>
                The 5-minute chart shows you noise. Higher timeframes show you the signal. Never trade the 5M in isolation.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Calling every bounce a &ldquo;reversal&rdquo; and every dip a &ldquo;buying opportunity.&rdquo; Structure must actually break for a reversal to occur. Until the trend structure changes, the path of least resistance is the existing trend.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Learn to label swings on the chart. Mark higher highs, higher lows, lower highs, lower lows. This tells you the trend. If you cannot label the structure, do not trade.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Structure breaks (a lower low in an uptrend) are necessary but not sufficient for a reversal. You need structure break plus displacement plus follow-through. A single lower low could be a liquidity grab.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 3 — PD Arrays
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-3" number={3} title="PD Arrays (Premium & Discount Arrays)" difficulty="beginner">
            <ConceptCard title="What Are PD Arrays?">
              <p>
                PD Arrays (Premium/Discount Arrays) are specific zones on the chart where institutional order flow is likely concentrated. They include Fair Value Gaps, Order Blocks, Liquidity Pools, and Breaker Blocks. Think of them as magnets and walls — price is drawn to some and pushed away from others.
              </p>
              <p>
                <strong>Analogy:</strong> Imagine a parking lot. PD Arrays are the spots where big trucks are parked. You can see where they stopped, and you know that when they move, the whole lot rearranges. Small cars (retail) park around them.
              </p>
            </ConceptCard>

            <ConceptCard title="Fair Value Gaps (FVGs)">
              <p>
                A Fair Value Gap is a three-candle pattern where the middle candle&rsquo;s body is so large that it creates a gap between the first candle&rsquo;s high and the third candle&rsquo;s low (bullish) or the first candle&rsquo;s low and the third candle&rsquo;s high (bearish). This gap represents an area where price moved too fast for balanced two-sided trading to occur.
              </p>
              <p>
                Price tends to return to FVGs because the market wants to fill that imbalance — it wants efficient price discovery at every level.
              </p>
            </ConceptCard>

            <MiniDiagram title="Bullish Fair Value Gap">
{`  Candle 1    Candle 2    Candle 3
  ┌──┐
  │  │        ┌──┐
  │  │        │  │        ┌──┐
  └──┘        │  │        │  │
   ─ ─ ─ ─ ─ │  │ ─ ─ ─  │  │  ← FVG zone
              │  │        └──┘    (gap between
              └──┘                 C1 high & C3 low)`}
            </MiniDiagram>

            <ConceptCard title="Order Blocks">
              <p>
                An Order Block is the last opposing candle before a strong move. If price drops hard, the last green candle before the drop is a bearish order block. If price rallies hard, the last red candle before the rally is a bullish order block.
              </p>
              <p>
                The logic: institutional orders are so large they cannot be filled in one go. The order block marks where they started accumulating. When price returns to that level, the remaining orders may be waiting.
              </p>
            </ConceptCard>

            <ConceptCard title="Premium and Discount Zones">
              <p>
                Take any price range — the top half is &ldquo;premium&rdquo; (expensive) and the bottom half is &ldquo;discount&rdquo; (cheap). Smart money buys at a discount and sells at a premium. This is not a prediction — it is a framework for determining whether your entry has favorable or unfavorable pricing relative to the current range.
              </p>
              <p>
                <strong>Rule:</strong> In a bullish market, look for entries in the discount zone (below 50% of the range). In a bearish market, look for entries in the premium zone (above 50% of the range).
              </p>
            </ConceptCard>

            <ConceptCard title="Why Bullish Price Violates Bearish PDAs">
              <p>
                When the market is truly bullish, it will punch through bearish FVGs, bearish order blocks, and sell-side liquidity. This is not a contradiction — it is confirmation. A bullish market needs fuel. That fuel comes from triggering stops below and consuming bearish arrays.
              </p>
              <p>
                Conversely, a bearish market will violate bullish PDAs. And in consolidation? Price bounces between bullish and bearish PDAs like a ping-pong ball — neither side has enough conviction to break through.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="Trading the FVG Retest">
              <p>
                ES rallies from 5800 to 5830 with a strong displacement move at 9:45 AM. A clear bullish FVG forms between 5812 and 5818. Price continues higher to 5840, then pulls back. At 10:15, price retraces into the FVG at 5815 and prints a rejection wick. This is a high-probability long entry: you are buying in the discount of the recent move, at a level where institutional order flow was present.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Treating every FVG as a trade entry. Not all FVGs are created equal. A tiny FVG on the 5-minute chart in a choppy session is noise. A large FVG on the 15-minute chart with displacement and trend alignment is a real opportunity. Quality over quantity.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Learn to identify FVGs and Order Blocks on a clean chart. Mark them. Watch how price reacts when it returns to them. Build pattern recognition before you trade them.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The best PDA trades happen when multiple arrays stack in the same zone — an order block containing an FVG near a discount level with higher-timeframe alignment. Single-PDA trades are weaker than confluence zones.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 4 — Reading PDA Strength
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-4" number={4} title="Reading PDA Strength" difficulty="beginner">
            <ConceptCard title="Not All PDAs Are Equal">
              <p>
                The critical skill is not identifying PDAs — that is mechanical. The real skill is knowing whether a PDA will hold or break. A PDA can act as a wall (support/resistance) or a speed bump (price pauses briefly then blasts through). The difference depends on several factors.
              </p>
            </ConceptCard>

            <ConceptCard title="Displacement Quality">
              <p>
                A PDA created by a strong, fast move (displacement) is more likely to hold when retested. Displacement means the candle body is large relative to average, the move was efficient (small wicks), and volume was present. A PDA created by a weak, grinding move has less institutional involvement and is more likely to fail.
              </p>
            </ConceptCard>

            <ConceptCard title="Weak Reaction = Likely Break">
              <p>
                When price reaches a PDA and the reaction is small — tiny bounce, small wicks, slow drift — the PDA is likely to break. Strong PDAs produce fast, decisive reactions. If price touches a bullish order block and you see three small candles barely bouncing, that is not respect — that is absorption before a break.
              </p>
            </ConceptCard>

            <ConceptCard title="Multiple Tests Weaken PDAs">
              <p>
                Each time price tests a PDA, it consumes some of the orders sitting there. The first test is the strongest. By the third or fourth test, the orders are largely filled and the PDA has much less holding power. This is why double bottoms often break on the third test.
              </p>
            </ConceptCard>

            <ConceptCard title="Liquidity Beyond the PDA">
              <p>
                If there is a cluster of stop losses just beyond a PDA (equal lows below a bullish PDA, for example), the market has incentive to push through. Smart money runs stops for liquidity. A PDA with a wall of stops behind it is less safe than one with clean space behind it.
              </p>
            </ConceptCard>

            <ConceptCard title="Higher Timeframe Alignment">
              <p>
                A 5-minute bullish FVG means nothing if the 1-hour chart is bearish. PDAs that align with the higher timeframe direction are far stronger. Always check: does this PDA agree with the story the larger timeframe is telling?
              </p>
            </ConceptCard>

            <ConceptCard title="MSS/CISD Before Attack">
              <p>
                Market Structure Shift (MSS) or Change in State of Delivery (CISD) — when you see structure break before price reaches a PDA, the PDA is more likely to fail. If price is approaching a support zone but has already broken its uptrend structure, that support is in trouble.
              </p>
            </ConceptCard>

            <ExampleBox symbol="NQ" title="Recognizing a Weak PDA">
              <p>
                NQ has a bullish order block at 18,200 from two days ago. Price returns to it. On the first touch, it bounced 80 points. Yesterday, it tested again and only bounced 30 points. Today, it touches again — the bounce is 10 points and the candles are tiny. Plus, there are equal lows at 18,190 just below, and the 1H structure has already shifted bearish. This PDA is done. It will break.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Blindly buying every PDA touch. &ldquo;Support holds until it doesn&rsquo;t&rdquo; is not a strategy. You need to evaluate the quality of the PDA, the quality of the reaction, and the context around it before committing capital.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Before trading a PDA, ask: was it created with displacement? Is this the first test? Does the higher timeframe agree? If you cannot answer yes to at least two of these, skip it.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The best tell for PDA failure is effort vs. result. If the market puts in significant effort to hold a level (big candles, wicks) but makes no progress away from it, that effort is being absorbed and the level will likely break.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 5 — Multi-Timeframe Reading
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-5" number={5} title="Multi-Timeframe Reading" difficulty="beginner">
            <ConceptCard title="The Hierarchy">
              <p>
                Every timeframe tells a different part of the story. Trying to trade from a single timeframe is like reading one paragraph of a novel and guessing the ending. You need the full context.
              </p>
            </ConceptCard>

            <MiniDiagram title="Timeframe Hierarchy">
{`  DAILY        →  Big picture, overall trend direction
  ────────────────────────────────────────────────
  4-HOUR       →  Directional bias for the session
  ────────────────────────────────────────────────
  1-HOUR       →  Current battle / the map
  ────────────────────────────────────────────────
  15-MINUTE    →  Decision timeframe (trade or wait)
  ────────────────────────────────────────────────
  5-MINUTE     →  Entry timing ONLY (never trade alone)

  RULE: No trade unless 15M agrees with 1H.`}
            </MiniDiagram>

            <ConceptCard title="Daily = Big Picture">
              <p>
                The daily chart shows you the multi-day trend. Is the market in an uptrend, downtrend, or range on the daily? This determines your overall bias. You do not fight the daily trend unless you have a very specific reason.
              </p>
            </ConceptCard>

            <ConceptCard title="4H = Session Bias">
              <p>
                The 4-hour chart gives you the directional bias for your trading session. It shows the intermediate-term trend and the key PDAs that matter for the next several hours. If the 4H is bullish, you favor long setups.
              </p>
            </ConceptCard>

            <ConceptCard title="1H = The Map">
              <p>
                The 1-hour chart is your battlefield map. It shows the current structure, the key levels being fought over, and the PDAs that are in play. This is where you identify the narrative: are bulls or bears in control of the current fight?
              </p>
            </ConceptCard>

            <ConceptCard title="15M = Decision Timeframe">
              <p>
                The 15-minute chart is where you decide whether to trade or wait. It shows you the detailed structure within the 1H framework. If the 1H is bullish and the 15M shows a bullish FVG forming with displacement, you have a trade. If the 15M is choppy and unclear, you wait.
              </p>
            </ConceptCard>

            <ConceptCard title="5M = Entry Timing Only">
              <p>
                The 5-minute chart is exclusively for timing your entry after the higher timeframes have given you direction. You never analyze trade ideas on the 5M. You only use it to fine-tune your entry price within a 15M setup.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="Multi-Timeframe Alignment">
              <p>
                Daily: ES is in an uptrend, holding above the 20-day EMA. 4H: Pulled back to a 4H bullish FVG and bounced. 1H: Just made a higher high after a higher low — bullish structure intact. 15M: A new bullish FVG forms at 10:00 AM after displacement. 5M: You time your entry into the 15M FVG as price retraces.
              </p>
              <p>
                Every timeframe agrees. This is a high-confidence long. Now compare: if the 1H was making lower lows but you saw a bullish 5M candle, would you buy? No. That is trading noise against the current.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                The most common multi-timeframe mistake: seeing a setup on the 5-minute chart and taking it without checking if the 15M and 1H agree. This is how you end up buying a small bounce inside a larger downtrend.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Before any trade, check at least three timeframes: 1H for direction, 15M for the setup, and 5M for the entry. If they do not agree, do not trade.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The highest-probability trades occur when a higher timeframe PDA is being tested and the lower timeframe shows a market structure shift in the direction of the higher timeframe. That is multi-timeframe confluence.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 6 — Liquidity Mapping
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-6" number={6} title="Liquidity Mapping" difficulty="beginner">
            <ConceptCard title="What Is Liquidity?">
              <p>
                Liquidity is resting orders in the market. Stop losses, limit orders, and pending entries sitting at specific price levels. You cannot see them directly, but you can predict where they cluster based on obvious chart structures.
              </p>
              <p>
                <strong>Analogy:</strong> Liquidity is like water flowing downhill. It collects in the lowest, most obvious spots. The market, like gravity, draws price toward those pools.
              </p>
            </ConceptCard>

            <ConceptCard title="Key Liquidity Levels">
              <p>
                <strong>Previous Day High (PDH) / Previous Day Low (PDL):</strong> The most-watched levels in day trading. Stops cluster above PDH (shorts) and below PDL (longs). These are magnets.
              </p>
              <p>
                <strong>Overnight High (ONH) / Overnight Low (ONL):</strong> Defined by the electronic trading hours (ETH) before the regular session (RTH). These represent the positioning done before the main session.
              </p>
              <p>
                <strong>Equal Highs / Equal Lows:</strong> When price makes two or more highs at nearly the same level, it creates a visible line that every trader sees. The stops above it are obvious and attract price like a magnet. Same logic for equal lows.
              </p>
            </ConceptCard>

            <MiniDiagram title="Liquidity Pools">
{`  Buy-side liquidity (stops from shorts)
  ═══════════════════════════════════════  ← Equal highs / PDH
  ▲ ▲ ▲ ▲ ▲ Stops above

  ┌─────────── Price Range ───────────┐
  │                                    │
  │     Market trades here             │
  │                                    │
  └────────────────────────────────────┘

  ▼ ▼ ▼ ▼ ▼ Stops below
  ═══════════════════════════════════════  ← Equal lows / PDL
  Sell-side liquidity (stops from longs)`}
            </MiniDiagram>

            <ConceptCard title="Internal vs External Liquidity">
              <p>
                <strong>Internal liquidity</strong> is the FVGs and inefficiencies within the current price range. Price returns to these to &ldquo;rebalance&rdquo; or fill gaps in price discovery.
              </p>
              <p>
                <strong>External liquidity</strong> is the stop clusters beyond the range — above the highs and below the lows. Price reaches for these to sweep stops and find counterparties.
              </p>
              <p>
                The market alternates between targeting internal and external liquidity. After sweeping external liquidity (running stops above a high), price often returns to fill internal liquidity (an unfilled FVG below). This creates the back-and-forth rhythm of the market.
              </p>
            </ConceptCard>

            <ConceptCard title="Liquidity Sequencing">
              <p>
                Price does not move randomly between liquidity targets. There is a sequence. First, price typically targets one side&rsquo;s liquidity (say, sell-side below equal lows), then reverses to target the other side&rsquo;s liquidity (buy-side above a high). Understanding this sequence gives you a roadmap for the session.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="The Sweep-and-Reverse">
              <p>
                ES opens at 5850. PDL is at 5830 with equal lows at 5832. In the first 30 minutes, price drops to 5828 — taking out PDL and equal lows. A massive cluster of stop losses gets triggered, providing liquidity for smart money to buy. Price immediately reverses and rallies 40 points. The sell-side liquidity was the fuel for the buy program.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Placing your stop loss at an obvious level (just below PDL, just above PDH) where everyone else&rsquo;s stops are. That is the exact spot the market targets. Place your stop beyond the obvious level, or use a different risk management approach.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>At the start of each session, mark PDH, PDL, ONH, ONL, and any equal highs/lows. These are your liquidity targets. Ask: which one is price likely going after first?</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The highest-probability entries happen immediately after a liquidity sweep. When external liquidity is taken and you see displacement in the opposite direction with an FVG, that is the institutional model: sweep → displacement → FVG → entry.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 7 — Market State
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-7" number={7} title="Market State" difficulty="beginner">
            <ConceptCard title="Five Market States">
              <p>
                Before any entry model matters, you must identify what the market is doing. There are five states, and each one requires a completely different approach.
              </p>
            </ConceptCard>

            <MiniDiagram title="Market State Recognition">
{`  STATE          DESCRIPTION                  APPROACH
  ─────────────────────────────────────────────────────
  TREND          Clear direction, structure   Trade with trend
  RANGE          Bounded, no direction        Fade extremes or wait
  TRANSITION     Structure breaking           Prepare, don't chase
  EXPANSION      Fast, volatile move          Already underway, trail
  EXHAUSTION     Trend losing steam           Protect profits, no new`}
            </MiniDiagram>

            <ConceptCard title="Trend">
              <p>
                The market is making clear higher highs/higher lows or lower highs/lower lows. PDAs in the trend direction hold. Counter-trend PDAs get violated. This is the easiest state to trade: find PDAs in the direction of the trend and enter on retests.
              </p>
            </ConceptCard>

            <ConceptCard title="Range">
              <p>
                Price is bouncing between defined boundaries with no sustained direction. Most losses happen because traders treat a range like a trend. In a range, the best approach is either to fade the extremes (sell at resistance, buy at support) or to wait for a breakout.
              </p>
            </ConceptCard>

            <ConceptCard title="Transition">
              <p>
                The market is shifting from one state to another — trend to range, range to trend, bullish to bearish. This is characterized by mixed signals, failed breakouts, and choppy action. It is the hardest state to trade. The best approach is usually to reduce size or sit out until the new state becomes clear.
              </p>
            </ConceptCard>

            <ConceptCard title="Balance vs Imbalance">
              <p>
                A balanced market has roughly equal participation from both sides — price auctions back and forth efficiently. An imbalanced market has one side clearly dominant — price moves directionally. All profitable trades come from correctly identifying imbalance and trading in its direction.
              </p>
            </ConceptCard>

            <ExampleBox symbol="NQ" title="Identifying Expansion Early">
              <p>
                NQ has been in a tight range for two hours between 18,300 and 18,340. Suddenly, a large candle breaks below 18,300 with three times the average body size. This is not a normal range test — this is expansion. The character of the market has changed. Traders who keep trying to buy the bottom of the old range will get run over. The market state shifted from range to expansion (bearish).
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Applying a trending strategy in a range, or a range strategy in a trend. Using the same approach regardless of market state is the single most common source of consistent losses. Before you ask &ldquo;what should I trade?&rdquo; ask &ldquo;what is the market doing?&rdquo;
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>At the start of each session, label the market state: trend, range, transition, expansion, or exhaustion. Write it down. If you are not sure, default to &ldquo;wait.&rdquo;</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Market state identification is more valuable than any entry signal. A mediocre entry in the right market state will outperform a perfect entry in the wrong market state. Master state recognition before you refine entry mechanics.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 8 — Auction Market Theory
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-8" number={8} title="Auction Market Theory" difficulty="intermediate">
            <ConceptCard title="Markets Are Auctions">
              <p>
                The stock market is not a store with fixed prices. It is an auction. Price constantly moves up and down to find the level where the most buyers and sellers are willing to transact. This process of price discovery is the fundamental driver of all price action.
              </p>
              <p>
                <strong>Analogy:</strong> Think of an estate sale. The auctioneer starts at a price. Too high? Nobody bids, so the price drops. Too low? Everyone bids, so the price rises. The market does the same thing every day, every session, every minute.
              </p>
            </ConceptCard>

            <ConceptCard title="Balance">
              <p>
                A balanced market has found a price area where both buyers and sellers are relatively satisfied. Volume concentrates in this area. Price rotates within it. This is &ldquo;value&rdquo; — the price range that the market has accepted as fair.
              </p>
            </ConceptCard>

            <ConceptCard title="Imbalance">
              <p>
                An imbalanced market is moving directionally because one side is more aggressive. Price is leaving the value area to find new willing participants. During imbalance, the market is rejecting the current value and searching for a new one.
              </p>
            </ConceptCard>

            <ConceptCard title="Acceptance and Rejection">
              <p>
                When price moves to a new level and stays there (time + volume), the market has &ldquo;accepted&rdquo; that price. When price moves to a new level and quickly snaps back, the market has &ldquo;rejected&rdquo; it. Acceptance means value is migrating. Rejection means the move was a probe, not a commitment.
              </p>
            </ConceptCard>

            <ConceptCard title="Failed Auction">
              <p>
                A failed auction happens when price tries to move in one direction, fails to attract follow-through, and reverses. This is one of the most powerful signals in trading. A failed auction to the downside (price tries to sell off, fails, and reverses higher) tells you that sellers could not find willing participants at lower prices — the path of least resistance is now higher.
              </p>
            </ConceptCard>

            <ConceptCard title="Value Migration">
              <p>
                Over time, the accepted value area shifts. In an uptrend, value migrates higher. In a downtrend, value migrates lower. Tracking where value is and where it is migrating to gives you the directional bias that most technical traders miss.
              </p>
            </ConceptCard>

            <ConceptCard title="Price Seeks Liquidity and Value">
              <p>
                Price moves for two reasons: to find liquidity (resting orders to transact against) and to find value (a price where balanced trading can occur). This is not about buyers being &ldquo;strong.&rdquo; A rally might happen because the market needs to reach a price level where sellers are willing to engage — not because buyers are pushing prices up out of enthusiasm.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="Failed Auction in Practice">
              <p>
                ES opens and sells off 15 points in the first 20 minutes. But the selling is slow — small-bodied candles, lots of wicks. The market is trying to auction lower but not finding responsive sellers. At 9:50, the low is tested again but holds on a long lower wick. This is a failed auction to the downside. ES then rallies 35 points as the market discovers that value is actually higher, not lower.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Assuming every price move is driven by conviction. Many moves are probes — the market testing to see if there are willing participants at a new level. If the probe fails, the move reverses. Do not chase probes.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>When price makes a new high or low, ask: is the market accepting this level (spending time, building volume) or rejecting it (fast reversal, long wicks)? The answer tells you what happens next.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Failed auctions are among the highest-probability setups because they reveal that one side tried and failed. The information content is high: the market tested a hypothesis (lower/higher prices) and found it wrong. Trade accordingly.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 9 — Sophisticated Candle Reading
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-9" number={9} title="Sophisticated Candle Reading" difficulty="intermediate">
            <ConceptCard title="Beyond Patterns — Reading Each Candle">
              <p>
                Forget memorized patterns. Each candle is a data point that tells you about the battle between buyers and sellers during that time period. The body, the wicks, the close location, and the relationship to the previous candle all contain information.
              </p>
            </ConceptCard>

            <ConceptCard title="Strong vs Weak Candles">
              <p>
                A strong candle has a large body, small wicks, and closes near its extreme (a bullish candle closes near its high). This shows conviction — one side dominated the entire period. A weak candle has a small body, large wicks, and closes near the middle. This shows indecision or absorption — neither side won.
              </p>
            </ConceptCard>

            <ConceptCard title="Wick Meaning">
              <p>
                A long upper wick means price went higher but was rejected — sellers stepped in and pushed it back down. A long lower wick means price went lower but was rejected — buyers defended. The wick shows where the market tried to go and failed. That failure is information.
              </p>
            </ConceptCard>

            <ConceptCard title="Close Location">
              <p>
                Where the candle closes is the most important data point. A close near the high suggests buyers are in control going into the next candle. A close near the low suggests sellers dominate. A close in the middle suggests neither side has conviction.
              </p>
            </ConceptCard>

            <ConceptCard title="Effort vs Result">
              <p>
                This is one of the most powerful concepts in candle reading. If a candle has a massive range (high effort) but closes near its open (minimal result), something is wrong. The effort should produce a result. When it does not, the opposing side is absorbing the pressure, and a reversal is likely.
              </p>
            </ConceptCard>

            <ConceptCard title="Absorption">
              <p>
                Absorption happens when large orders quietly absorb selling or buying pressure without moving price much. You see this as candles with large volume but small bodies — the effort is happening, but the result (price movement) is being absorbed by a large participant on the other side.
              </p>
            </ConceptCard>

            <ConceptCard title="Displacement Quality">
              <p>
                Not all displacement is equal. High-quality displacement has: large body relative to average, small wicks, a close near the extreme, and is followed by continuation (at least one more candle in the same direction). Low-quality displacement has wicks, closes near the middle, or is immediately followed by a reversal candle.
              </p>
            </ConceptCard>

            <ConceptCard title="Overlap vs Efficiency">
              <p>
                Efficient price delivery means candles stack with minimal overlap — each candle picks up where the last one left off. This is a strong trend. Overlapping candles (each candle trades through the range of the previous one) indicate indecision, consolidation, or a weakening move.
              </p>
            </ConceptCard>

            <ExampleBox symbol="NQ" title="Reading Effort vs Result">
              <p>
                NQ drops 60 points on a single red candle at 10:00 AM — that is high effort. But the next candle is a 50-point green candle that retraces most of the drop, closing near the high of the previous candle. The result of the selling effort was almost entirely erased. This tells you that buyers are absorbing the selling. The next move is more likely up than down, despite the scary-looking red candle.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Reading candles in isolation. A single hammer candle at a random level means almost nothing. The same hammer candle at a key PDA after a liquidity sweep on the 15M that aligns with a 1H bullish structure — that means everything. Context makes the candle meaningful.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>For every candle that catches your eye, ask three questions: Was the body large or small? Where did it close (high, low, middle)? Did the next candle follow through or reverse it?</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The most revealing candle on the chart is the one that shows high effort with low result. It means a large participant is operating on the other side. When you see this at a key level, the probability of reversal increases significantly.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 10 — Trapped Traders
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-10" number={10} title="Trapped Traders" difficulty="intermediate">
            <ConceptCard title="The Fuel of Big Moves">
              <p>
                Some of the best trading setups come not from buying strength or selling weakness, but from understanding where traders are trapped and will be forced to exit. When traders are trapped on the wrong side of a move, their stop losses and forced exits become the fuel that powers the move in the opposite direction.
              </p>
              <p>
                <strong>Analogy:</strong> Imagine a crowded theater with one exit. If someone yells &ldquo;fire,&rdquo; the rush to the door is violent and fast. Trapped traders exiting is the same — the urgency creates explosive moves.
              </p>
            </ConceptCard>

            <ConceptCard title="Trapped Longs">
              <p>
                Traders who bought at the high and are now holding losing positions as price drops. They are hoping for a bounce to exit at break-even. When that bounce does not come, or when price drops to their stop level, they are forced to sell — adding to the selling pressure and accelerating the downmove.
              </p>
            </ConceptCard>

            <ConceptCard title="Trapped Shorts">
              <p>
                Traders who sold at the low and are now watching price rally against them. Their buy-to-cover orders, triggered by stops or margin calls, add buying pressure that fuels the rally higher.
              </p>
            </ConceptCard>

            <ConceptCard title="Failed Breakouts">
              <p>
                A breakout above resistance draws in breakout buyers. If the breakout immediately fails and price reverses below resistance, those buyers are now trapped. Their stops are hit, creating selling pressure that was not there before the false breakout. This is why failed breakouts often lead to strong moves in the opposite direction.
              </p>
            </ConceptCard>

            <ConceptCard title="Stop Cascades">
              <p>
                When price hits a cluster of stop losses, the resulting orders push price further, hitting the next cluster of stops, which pushes price further still. This cascade creates the fast, one-directional moves you see on the chart — they are not driven by new conviction, but by forced liquidation.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="The False Breakout Trap">
              <p>
                ES breaks above the previous day high at 5880 — everyone sees it as a &ldquo;bullish breakout.&rdquo; Breakout traders go long. But within two candles, price reverses below 5880. Now all those breakout buyers are underwater. As price drops to 5870, their stops start triggering. The cascade of stop losses pushes ES down to 5850 in 15 minutes. The breakout buyers became the fuel for the downmove.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Being the trapped trader. Entering breakouts at the obvious level with your stop at the obvious place is the textbook way to become fuel for someone else&rsquo;s trade. Wait for confirmation after the breakout, or trade the retest instead.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>After a strong move, ask: who just got trapped? Where are their stops? When those stops get triggered, that is often the next move you should be looking for.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Failed moves produce fast moves. This is a core principle. When the market tries something and fails, the resulting unwind is usually faster and more violent than the initial attempt. Trade the failure, not the attempt.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 11 — Acceptance vs Rejection
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-11" number={11} title="Acceptance vs Rejection" difficulty="intermediate">
            <ConceptCard title="A Level Touch Is Not Enough">
              <p>
                When price reaches a key level — support, resistance, PDA, liquidity — many traders immediately react. &ldquo;It touched support, I&rsquo;m buying!&rdquo; But touching a level tells you nothing by itself. What matters is what happens after the touch. Does price accept the new level or reject it?
              </p>
            </ConceptCard>

            <ConceptCard title="Acceptance Requires Time">
              <p>
                Acceptance means the market is willing to trade at the new level. You see this as: multiple candles closing beyond the level, volume building at the new price, and price using the level as a base rather than reversing from it. Acceptance takes time — a quick spike beyond a level followed by a reversal is not acceptance; it is a probe or sweep.
              </p>
            </ConceptCard>

            <ConceptCard title="Rejection Requires Displacement">
              <p>
                Rejection means the market tested a price and said &ldquo;no.&rdquo; You see this as: a fast move away from the level, long wicks, immediate displacement candles in the opposite direction. Real rejection is decisive and fast. A slow drift away from a level is not rejection — it is indecision.
              </p>
            </ConceptCard>

            <ConceptCard title="The Reaction Matters More Than the Level">
              <p>
                Two identical support levels can produce completely different outcomes depending on the quality of the reaction. A support level that produces an immediate large bullish displacement candle with follow-through is holding. The same support level that produces a small bounce with overlapping candles is failing. Read the reaction, not just the level.
              </p>
            </ConceptCard>

            <ExampleBox symbol="NQ" title="Acceptance Above Resistance">
              <p>
                NQ has resistance at 18,400. Price breaks above it and the first candle closes at 18,420. Instead of immediately falling back, the next three candles all close above 18,400, with the low of each candle holding above the breakout level. Volume increases at the new price area. This is acceptance — the market has decided that 18,400 is now support. Old resistance becomes new support because the market accepted the new value area.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Interpreting a spike through a level as a breakout. Spikes are probes — the market testing for liquidity. A level is only &ldquo;broken&rdquo; when the market accepts the new price with time and repeated trading above/below it. Wait for the close and the follow-through, not the spike.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>When price reaches a key level, do not react immediately. Wait at least 2-3 candles to see if the market accepts or rejects the new price. The quality of the reaction tells you whether to trade and in which direction.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The best entries come when the market clearly rejects a level with displacement and an FVG forms during the rejection. That FVG becomes your entry when price retests it — you are trading the rejection with a defined risk.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 12 — Time-Based Price Action
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-12" number={12} title="Time-Based Price Action" difficulty="intermediate">
            <ConceptCard title="Time Is a Filter">
              <p>
                The same chart pattern at 9:45 AM and at 12:30 PM has completely different probabilities of success. Time filters everything. The quality of participants, the amount of liquidity, and the market&rsquo;s tendency to trend or chop all change dramatically throughout the trading day.
              </p>
            </ConceptCard>

            <MiniDiagram title="Session Time Windows (ET)">
{`  TIME              NAME                QUALITY
  ──────────────────────────────────────────────────
  4:00-9:30         Pre-market (ETH)    Low vol, positioning
  9:30-11:00        Morning Session     ★★★ BEST window
  11:00-11:30       Transition          Mixed signals
  11:30-1:30        Lunch Chop          ★ WORST window
  1:30-3:00         Afternoon Pickup    ★★ Moderate
  3:00-4:00         Power Hour          ★★★ Strong moves
  4:00-8:00         After-hours         Low vol, gaps`}
            </MiniDiagram>

            <ConceptCard title="9:30-11:00 AM: The Best Execution Window">
              <p>
                This is when institutional order flow is heaviest. The opening 90 minutes typically establish the day&rsquo;s direction, sweep overnight liquidity, and produce the highest-quality setups. Most consistently profitable day traders make their money in this window.
              </p>
            </ConceptCard>

            <ConceptCard title="11:30 AM - 1:30 PM: Lunch Chop">
              <p>
                Volume drops, spreads widen, and the market enters a low-conviction chop zone. Setups that look clean are actually traps because there is not enough participation to follow through. This is where most unnecessary losses accumulate. The best strategy during lunch? Walk away.
              </p>
            </ConceptCard>

            <ConceptCard title="3:00-4:00 PM: Power Hour">
              <p>
                Institutional algorithms rebalance, portfolio managers adjust positions, and the market often makes its strongest directional move of the day. If the morning established a direction, power hour often delivers the extension. This is also where MOC (Market on Close) orders create volume surges.
              </p>
            </ConceptCard>

            <ConceptCard title="Futures ETH vs RTH">
              <p>
                Electronic Trading Hours (ETH) — the overnight session — is thinner and more prone to false moves. Regular Trading Hours (RTH) is when the real battle happens. Overnight levels matter as reference points, but trades taken during ETH carry more risk due to lower liquidity.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="Same Setup, Different Time">
              <p>
                A bullish FVG forms on ES at 9:50 AM after a sweep of PDL. Price retraces to the FVG and you enter long — price rallies 25 points. Great trade. Now imagine the same setup forms at 12:15 PM. Price retraces to the FVG, you enter long — price chops sideways for an hour and stops you out. The setup was identical. The time was different. Time changed the probability.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Trading through lunch because you are bored or want to &ldquo;make back losses.&rdquo; Lunch chop is specifically designed (by market structure, not conspiracy) to trap both sides. The low volume means your stop gets run easily and there is no follow-through on entries.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Trade between 9:30-11:00 AM and 3:00-4:00 PM. Avoid 11:30-1:30 PM. This one rule will eliminate a large percentage of your losing trades.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The time of day determines the &ldquo;type&rdquo; of price action. Morning is for direction establishment and liquidity sweeps. Afternoon is for continuation or reversal of the morning narrative. Trading the wrong model at the wrong time is a strategy mismatch.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 13 — ES vs NQ Relative Strength
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-13" number={13} title="ES vs NQ Relative Strength" difficulty="intermediate">
            <ConceptCard title="Two Markets, One Story">
              <p>
                ES (S&P 500 futures) and NQ (Nasdaq futures) move together most of the time, but their divergences tell you something critical about the character of the market. ES is broader and more diverse. NQ is tech-heavy and more volatile. When they disagree, one of them is lying — and that lie gives you an edge.
              </p>
            </ConceptCard>

            <ConceptCard title="Divergence Signals">
              <p>
                <strong>NQ makes new low but ES does not:</strong> The selling is concentrated in tech. ES is holding up because value stocks, financials, or other sectors are bid. This divergence often means the low is close — the selling is narrow, not broad-based.
              </p>
              <p>
                <strong>ES sweeps a high but NQ fails:</strong> ES made a new high but NQ could not confirm it. This suggests the breadth of the buying is weak — it is concentrated in non-tech names. Weak confirmation of new highs is a warning sign.
              </p>
            </ConceptCard>

            <ConceptCard title="Confirmation">
              <p>
                When both ES and NQ make new highs together, that is confirmation — the buying is broad-based and healthy. When both make new lows together, the selling is broad and real. Confirmation from both instruments increases your confidence in the direction.
              </p>
            </ConceptCard>

            <ConceptCard title="Tech-Led Moves">
              <p>
                A &ldquo;risk-on&rdquo; day where NQ is significantly outperforming ES (NQ up 1.5%, ES up 0.5%) signals tech/growth leadership. A day where ES outperforms NQ signals rotation into value/defensive names. The relationship between the two tells you what type of money is flowing and where.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES/NQ" title="Reading the Divergence">
              <p>
                At 10:00 AM, NQ drops to a new session low at 18,200. But ES, which had been tracking NQ all morning, holds above its previous low at 5,835. This divergence tells you: the selling pressure is tech-specific, not market-wide. If you are looking for a long, this is a better setup than if both had made new lows — the broader market (ES) is showing you that buyers are defending.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Trading NQ or ES without checking what the other is doing. They are in a relationship. If you go long NQ because of a bullish pattern but ES is breaking down, you are missing half the picture.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Always have both ES and NQ charts open. Before taking any trade, check whether the other index confirms or diverges. Divergence is a warning; confirmation is green light.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Relative strength rotation between ES and NQ within the day often precedes reversals. If NQ was leading all morning and suddenly ES starts outperforming, the character of buying is changing — which often signals the end of the tech-led move.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 14 — Advanced Auction Behavior
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-14" number={14} title="Advanced Auction Behavior" difficulty="advanced">
            <ConceptCard title="Price Seeks Efficient Inventory Transfer">
              <p>
                At the deepest level, price exists to facilitate the transfer of risk between participants. Buyers want to acquire inventory at the lowest price. Sellers want to distribute inventory at the highest price. Price moves to find the level where this exchange happens most efficiently.
              </p>
            </ConceptCard>

            <ConceptCard title="Finding Willing Counterparties">
              <p>
                When price moves higher, it is not always because buyers are enthusiastic. It may be because there are no sellers at the current level, so price must rise to find someone willing to sell. The move higher is a search, not a statement of strength. This distinction is crucial for reading price action correctly.
              </p>
            </ConceptCard>

            <ConceptCard title="Strong-Looking Moves Can Be Fragile">
              <p>
                A sharp rally through thin liquidity looks impressive but is actually fragile. There were no sellers to resist the move — but there were also no committed buyers at these levels. The first real seller who shows up can collapse the entire move because it was built on air, not on genuine demand.
              </p>
            </ConceptCard>

            <ConceptCard title="Compression Creates Potential Energy">
              <p>
                When price consolidates in a tight range, it is building potential energy — like a compressed spring. Orders accumulate on both sides. The longer the compression, the more violent the eventual breakout will be, because a larger number of trapped participants will need to exit when the spring releases.
              </p>
            </ConceptCard>

            <ConceptCard title="Information Creates Price">
              <p>
                Price does not move and then people react. Information arrives, participants process it, and their actions create price. A strong candle at 10:00 AM might not be caused by &ldquo;buying pressure&rdquo; — it might be caused by a CPI print, an earnings leak, a large options expiration, or an institutional rebalance. The price is the effect, not the cause.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="Rally Through Thin Liquidity">
              <p>
                ES is at 5,850 during lunch (12:00 PM). A few market buy orders push price to 5,860 in two candles. It looks bullish. But the order book is thin — there simply were not any sellers between 5,850 and 5,860. At 1:30 PM, when real participants return, a single sell program pushes ES back to 5,845 in one candle. The entire lunch rally was a move through a liquidity vacuum, not genuine strength.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Assuming that the size of a move indicates its quality. A 30-point move through thin liquidity at noon is less meaningful than a 10-point move through heavy volume at 9:45 AM. Quality of the move matters more than quantity.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>When price makes a sharp move, ask: was there resistance to overcome, or did it just slide through empty space? Moves through resistance are real. Moves through vacuum are fragile.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The best auction theory trades come from identifying where the market is searching for counterparties and positioning where those counterparties will eventually be found. You are not predicting direction — you are predicting where the transaction will occur.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 15 — Market Microstructure
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-15" number={15} title="Market Microstructure" difficulty="advanced">
            <ConceptCard title="How Orders Actually Work">
              <p>
                Understanding microstructure means understanding the mechanics of how orders are matched and how this creates the price action you see on the chart. This is the plumbing of the market.
              </p>
            </ConceptCard>

            <ConceptCard title="Bid, Ask, and Spread">
              <p>
                The <strong>bid</strong> is the highest price someone is willing to pay right now. The <strong>ask</strong> is the lowest price someone is willing to sell for. The difference is the <strong>spread</strong>. In liquid markets like ES, the spread is usually 1 tick (0.25 points). In less liquid instruments or times, the spread widens.
              </p>
            </ConceptCard>

            <ConceptCard title="Market Orders vs Limit Orders">
              <p>
                <strong>Market orders</strong> say &ldquo;I want to buy/sell NOW at whatever price is available.&rdquo; They take liquidity from the order book. <strong>Limit orders</strong> say &ldquo;I want to buy/sell at this specific price or better.&rdquo; They provide liquidity to the order book.
              </p>
              <p>
                Market orders cause price to move. Limit orders are where price stops. The battle between aggressive market orders and passive limit orders creates all price action.
              </p>
            </ConceptCard>

            <ConceptCard title="Slippage">
              <p>
                Slippage is the difference between the price you expected and the price you got. It happens when your market order eats through the available liquidity at the best price and starts filling at worse prices. Slippage is worse during fast moves, during low liquidity, and when using large order sizes.
              </p>
            </ConceptCard>

            <ConceptCard title="The Order Book Concept">
              <p>
                Imagine a ladder with bid orders stacked below the current price and ask orders stacked above. When a large market buy order arrives, it eats through ask orders one by one, pushing price up. Where there are large limit orders (thick levels), price pauses. Where there are few limit orders (thin levels), price moves quickly.
              </p>
            </ConceptCard>

            <MiniDiagram title="Order Book Concept">
{`  Price    Ask (Sellers)
  5855     ████████████  (thick — price will slow here)
  5854     ████
  5853     ██
  5852     █             (thin — price will move fast)
  ─────── SPREAD ──────
  5851     ███
  5850     ██████████    (thick — buyers defending)
  5849     ████
  5848     ██
  Price    Bid (Buyers)`}
            </MiniDiagram>

            <ConceptCard title="Why Low-Liquidity Times Create Bad Fills">
              <p>
                During low-liquidity periods (pre-market, lunch, after-hours), there are fewer limit orders in the book. Your market order has to eat through more price levels to get filled, resulting in worse execution. This is why the same stop loss that would cost you 1 tick of slippage at 10:00 AM might cost you 3-4 ticks at 12:30 PM.
              </p>
            </ConceptCard>

            <ConceptCard title="Why Fast Moves Happen Through Thin Liquidity">
              <p>
                Fast moves (spikes, crashes, squeezes) happen when market orders hit an area with very few limit orders. There is nothing to slow the move down. This is why the space just beyond obvious levels (above equal highs, below equal lows) often produces the fastest price action — the stops are triggered (market orders) but there are few limit orders to absorb them.
              </p>
            </ConceptCard>

            <ExampleBox symbol="NQ" title="Thin Liquidity Spike">
              <p>
                NQ is at 18,350 at 12:15 PM (lunch). The order book is thin. A moderately sized buy program enters and pushes NQ to 18,380 in two candles — it looks like a breakout. But there were only 50 contracts on the ask at each level instead of the usual 200. When the program stops buying, there is nothing supporting the price. NQ falls back to 18,340 in five minutes. The spike was real in the sense that transactions occurred, but the move had no substance because the liquidity was not there to sustain it.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Using market orders for entries during low-liquidity periods. Your entry cost goes up due to slippage, and the move you are chasing is more likely to reverse. Use limit orders during thin periods, and accept that you may not get filled rather than paying a premium for bad fills.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Trade when the market is most liquid: 9:30-11:00 AM and 2:30-4:00 PM. Avoid trading during thin periods unless you are very experienced. Your execution will be better and your setups more reliable when liquidity is present.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Understanding microstructure explains why price reacts at certain levels: it is not magic — it is where resting orders cluster. When you see price stop at a level, it is because limit orders are absorbing market orders there. When price runs through a level, the limit orders were not sufficient to absorb the aggression.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 16 — Inventory Theory
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-16" number={16} title="Inventory Theory" difficulty="advanced">
            <ConceptCard title="The Market as Inventory Transfer">
              <p>
                Dealers and institutions do not trade like retail. They carry inventory — large positions that need to be acquired or distributed over time. They cannot simply buy or sell everything at once without moving the market against themselves. This creates specific price action patterns as they work their inventory.
              </p>
            </ConceptCard>

            <ConceptCard title="Price Moves to Transfer Risk">
              <p>
                When an institution needs to sell a large position, price might move higher first. Why? To attract willing buyers at better prices. The rally is not bullish conviction — it is a sell program setting up distribution. When a fund needs to buy, price might drop first to shake out weak longs and find lower entry prices.
              </p>
              <p>
                <strong>Analogy:</strong> If you own a house worth $500,000 and need to sell fast, you might list it at $480,000 to attract buyers. But if you need to sell slowly without alerting the neighborhood, you might let the perceived value rise to $520,000 first, then sell at various prices on the way down.
              </p>
            </ConceptCard>

            <ConceptCard title="Inventory Imbalance">
              <p>
                When too many participants are positioned on one side, the market is imbalanced. If everyone is long, there are no buyers left and the market is fragile to the downside. If everyone is short, there are no sellers left and the market can squeeze higher violently. The market naturally corrects inventory imbalances by moving price to force the overcrowded side to exit.
              </p>
            </ConceptCard>

            <ConceptCard title="Why Price Moves Higher to Attract Sellers">
              <p>
                This is counterintuitive for beginners. A rally does not always mean &ldquo;buyers are winning.&rdquo; Sometimes the market rallies because it needs to reach a price level where sellers are willing to engage. The rally is a search for selling inventory. Once sellers step in, the rally reverses. Understanding this means you stop interpreting every green candle as bullish.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="Distribution Through Higher Prices">
              <p>
                ES rallies 20 points from 5,830 to 5,850 in the first hour. Retail traders see a breakout and buy. But look closely: each higher high is made on decreasing volume. The candle bodies are getting smaller. The close locations are drifting toward the middle of each candle. An institution is selling into the rally — each push higher is met with distribution. At 5,855, the selling overwhelms the buying and ES drops 35 points in 30 minutes. The rally was not bullish. It was inventory distribution.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Interpreting rising price as bullish and falling price as bearish. Price direction and underlying intent can be completely different. Rising prices with decreasing volume, smaller candles, and bearish divergences suggest distribution, not accumulation. Always look at the quality of the move, not just the direction.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>When price is going up, ask: is this move building strength (growing candles, increasing volume) or losing steam (shrinking candles, decreasing volume)? One is accumulation. The other is distribution. The chart tells you which.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Inventory theory explains why the best short entries often come after a rally (distribution complete) and the best long entries often come after a selloff (accumulation complete). You are trading with the institution&rsquo;s completed inventory position, not against it.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 17 — Dealer Hedging
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-17" number={17} title="Dealer Hedging" difficulty="advanced">
            <ConceptCard title="What Dealers Do">
              <p>
                Options market makers (dealers) sell options to traders and hedge their exposure by buying or selling the underlying (stocks or futures). Their hedging activity creates mechanical, predictable flows in the market. This is not a theory — it is a structural reality of how markets function.
              </p>
            </ConceptCard>

            <ConceptCard title="Gamma Exposure (GEX)">
              <p>
                Gamma measures how much a dealer&rsquo;s hedge needs to change as price moves. When dealers are &ldquo;long gamma&rdquo; (positive GEX), they hedge by buying dips and selling rallies — this dampens volatility and creates mean-reversion, range-bound behavior. When dealers are &ldquo;short gamma&rdquo; (negative GEX), they hedge by selling dips and buying rallies — this amplifies volatility and creates trending, explosive behavior.
              </p>
            </ConceptCard>

            <MiniDiagram title="Gamma Exposure Effect on Price">
{`  POSITIVE GAMMA (Long Gamma)        NEGATIVE GAMMA (Short Gamma)
  ┌─────────────────────────┐        ┌─────────────────────────┐
  │  Price goes up:          │        │  Price goes up:          │
  │  → Dealers SELL to hedge │        │  → Dealers BUY to hedge  │
  │  → Dampens the rally     │        │  → Amplifies the rally   │
  │                          │        │                          │
  │  Price goes down:        │        │  Price goes down:        │
  │  → Dealers BUY to hedge  │        │  → Dealers SELL to hedge │
  │  → Dampens the drop      │        │  → Amplifies the drop    │
  │                          │        │                          │
  │  RESULT: Range/chop      │        │  RESULT: Trend/volatile  │
  └─────────────────────────┘        └─────────────────────────┘`}
            </MiniDiagram>

            <ConceptCard title="Why OPEX Matters">
              <p>
                Options Expiration (OPEX) — especially monthly and quarterly — creates massive shifts in gamma positioning. As options expire, the hedging flows associated with them disappear. This can abruptly change the market from range-bound (positive gamma) to volatile (negative gamma or neutral). The day after OPEX is often when trends begin because the dampening effect is removed.
              </p>
            </ConceptCard>

            <ConceptCard title="Large Gamma Zones">
              <p>
                Certain strike prices have very high open interest. These strikes create &ldquo;gravity&rdquo; — price tends to be pulled toward them as dealers hedge. A large call wall above the market can act as a ceiling because dealers selling into rallies create selling pressure. A large put wall below can act as a floor for the same reason (positive gamma hedging).
              </p>
            </ConceptCard>

            <ExampleBox symbol="SPY" title="OPEX Week Behavior">
              <p>
                SPY has been in a 10-point range for two weeks (high positive gamma from large options open interest). The monthly OPEX arrives on Friday. On Thursday, as options roll off, the gamma effect weakens. By Monday, SPY is free of the gamma pin and moves 20 points in a single day — a move that would have been dampened the previous week. The mechanical hedging flows that were suppressing volatility expired with the options.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Ignoring the options-driven environment. If you are trading a range strategy and gamma flips from positive to negative, your strategy stops working overnight. You do not need to trade options to be affected by them — the hedging flows from options move the underlying market you trade.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Know when OPEX is. Monthly OPEX is the third Friday. Expect range-bound behavior in the days before OPEX and potentially volatile behavior in the days after. Adjust your expectations accordingly.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Tracking aggregate gamma exposure (GEX) tells you whether the market is structurally set up for mean-reversion or trend. High positive GEX = fade extremes. Negative GEX = trade with momentum. This is a structural edge that most price action traders ignore.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 18 — Volatility Regimes
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-18" number={18} title="Volatility Regimes" difficulty="advanced">
            <ConceptCard title="Regime Is More Important Than Direction">
              <p>
                Most traders obsess over direction: &ldquo;Is it going up or down?&rdquo; But the volatility regime — how the market is moving — is more important than which direction it moves. Your stop loss size, position size, target expectations, and strategy selection all depend on the volatility regime, not the direction.
              </p>
            </ConceptCard>

            <ConceptCard title="Volatility Expansion">
              <p>
                The market is making large moves, ranges are widening, and candles are growing. This is when breakout strategies work, when trends develop, and when the reward for correct trades is highest. But your risk is also highest — stops need to be wider.
              </p>
            </ConceptCard>

            <ConceptCard title="Volatility Compression">
              <p>
                The market is quiet, ranges are narrow, and candles are small. This is when mean-reversion works and trend-following gets chopped up. But compression always precedes expansion. The question is: when will it break, and in which direction?
              </p>
            </ConceptCard>

            <ConceptCard title="Day Types">
              <p>
                <strong>Trend day:</strong> Strong, one-directional move all day. Rare (10-15% of days) but accounts for most of the year&rsquo;s range. Do not fight it — trail and ride.
              </p>
              <p>
                <strong>Range day:</strong> Price oscillates between a high and low with no sustained direction. Most common (~60% of days). Fade extremes or trade PDAs within the range.
              </p>
              <p>
                <strong>News day:</strong> CPI, FOMC, NFP. Initial reaction is often wrong. Whipsaw is common. Reduced size or no trades until the dust settles.
              </p>
            </ConceptCard>

            <ConceptCard title="CPI/FOMC Behavior">
              <p>
                Major economic releases (CPI, FOMC) create unique price action. The initial spike (first 5-15 minutes) is reactive and often reverses. The real move often starts 30-60 minutes after the release as institutions finish processing the data and positioning. Trading the initial spike is gambling. Trading the post-reaction setup is trading.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="Recognizing a Trend Day Early">
              <p>
                ES opens and immediately drops 10 points with large, clean candles — no overlap, closes near lows. It pulls back 3 points on tiny candles, then drops another 15 points. The pullbacks are shallow and brief. There is no fight at support levels — they break immediately. By 10:00 AM, you should recognize this as a trend day. Stop looking for longs. Stop trying to pick the bottom. Join the trend, trail your stop, and let it run.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Using the same position size and stop width regardless of volatility. On a 30-ATR expansion day, your normal 8-point stop on ES gets hit as noise. On a 10-ATR compression day, an 8-point stop is enormous relative to the range. Scale your risk to the environment.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>At the start of each session, check the VIX and recent daily ranges. If VIX is high or ranges are expanding, expect volatile moves — use wider stops and smaller size. If VIX is low, expect range-bound action.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The highest-edge regime recognition is identifying the transition from compression to expansion before it happens. Look for: multiple days of narrowing range, decreasing volume, and then a sudden volume spike with range expansion. That is the breakout from compression.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 19 — Flow Analysis
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-19" number={19} title="Flow Analysis" difficulty="advanced">
            <ConceptCard title="Not All Buyers Are Equal">
              <p>
                A trade is a trade on the tape, but the intent behind it determines what happens next. A scalper buying to cover in 30 seconds has zero impact on the next hour. An institution buying 10,000 contracts over the afternoon shapes the entire session. Understanding who is behind the flow tells you whether the move will continue or fade.
              </p>
            </ConceptCard>

            <ConceptCard title="Types of Flow">
              <p>
                <strong>Scalper flow:</strong> Very short-term, both directions, creates noise. Visible as rapid alternating between buy and sell. Does not create sustained moves.
              </p>
              <p>
                <strong>Day trader flow:</strong> Intraday directional, reacts to levels and patterns. Creates the moves you see within the session but exits by close.
              </p>
              <p>
                <strong>CTA/Systematic flow:</strong> Algorithm-driven, trend-following or mean-reversion. Mechanical, predictable at certain thresholds. When a moving average is crossed or a volatility breakout triggers, these programs activate in size.
              </p>
              <p>
                <strong>Institutional flow:</strong> Large, directional, slow. Executed over hours or days. This is what creates the real trends. It is hard to see in real-time because it is deliberately hidden using algorithms (TWAP, VWAP, iceberg orders).
              </p>
              <p>
                <strong>Hedging flow:</strong> Non-directional, mechanical. Portfolio hedging, gamma hedging, delta hedging. Creates moves that look directional but are actually reactive.
              </p>
            </ConceptCard>

            <ConceptCard title="Inferring Flow from Price Behavior">
              <p>
                You cannot see order flow directly (without expensive tools), but price behavior reveals it. Institutional buying looks like: steady grind higher with shallow pullbacks, increasing volume on advances, and decreasing volume on pullbacks. Institutional selling looks like: lower highs, decreasing volume on rallies, and expanding volume on drops. Hedging flow looks like: mechanical, rhythmic, often mean-reverting.
              </p>
            </ConceptCard>

            <ExampleBox symbol="NQ" title="Institutional vs Scalper Flow">
              <p>
                NQ drops 30 points from 18,350 to 18,320 on a large red candle. But the next 15 minutes show: price holds 18,315-18,325 on moderate volume. Small candles. No panicked selling. Then a series of green candles with growing bodies slowly pushes price back to 18,340. This is not a &ldquo;V-bounce&rdquo; — it is institutional accumulation. The initial drop was retail/scalper selling. The quiet accumulation was institutional buying. The flow types told a different story than the initial move.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Treating all volume as equal. 10,000 contracts of scalper flow that cancels itself out within minutes is not the same as 10,000 contracts of institutional buying spread over two hours. The same volume number can mean completely different things depending on the type of flow.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Look at how price behaves after a move, not just the move itself. If a drop is followed by quiet holding and slow recovery, someone is buying. If a drop is followed by continued selling on smaller bounces, the flow is genuinely bearish.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The highest-quality flow signal is when aggressive selling (large red candles) is met with no follow-through — price just sits there. This is absorption: a larger passive buyer is absorbing all the aggressive selling. When the aggressive sellers run out, price explodes higher on the accumulated buy inventory.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 20 — Reflexivity
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-20" number={20} title="Reflexivity" difficulty="advanced">
            <ConceptCard title="Price Affects Participants, Participants Affect Price">
              <p>
                George Soros formalized this concept: markets are reflexive, meaning price does not just passively reflect reality — it actively shapes it. When stocks go up, people feel richer, spend more, companies report better earnings, which pushes stocks up more. When stocks crash, the opposite happens. Price is both a thermometer and a thermostat.
              </p>
            </ConceptCard>

            <ConceptCard title="Self-Reinforcing Loops">
              <p>
                A rally attracts momentum buyers, whose buying pushes prices higher, attracting more buyers. A selloff triggers stop losses, whose selling pushes prices lower, triggering more stop losses. These feedback loops explain why markets overshoot in both directions — they are self-reinforcing until they run out of fuel.
              </p>
            </ConceptCard>

            <ConceptCard title="Short Squeeze">
              <p>
                When heavily shorted, a price increase forces shorts to cover (buy back shares). Their buying pushes price higher, forcing more shorts to cover, pushing price higher still. This is reflexivity in action — the price movement causes the very buying that sustains it. The squeeze continues until short interest is exhausted.
              </p>
            </ConceptCard>

            <ConceptCard title="Long Liquidation">
              <p>
                The mirror image: when overleveraged longs face margin calls, they must sell. Their selling pushes prices lower, triggering more margin calls, causing more selling. This creates the cascading selloffs you see in market crashes — each tick lower creates new forced sellers.
              </p>
            </ConceptCard>

            <ConceptCard title="Why Obvious Levels Sometimes Fail">
              <p>
                If every trader sees the same support level, they all buy there. But if the market knows everyone is buying there, it becomes a target. Sweep the level, trigger all the stops, and use that liquidity. When too many people see the same thing, reflexivity works against the crowd — the obvious trade becomes the trap.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="The Reflexive Cascade">
              <p>
                ES breaks below a widely-watched support at 5,800. Thousands of stop-loss orders trigger. But it does not stop there — the stop-loss selling causes more selling, which breaks the next support at 5,790, triggering more stops, which break 5,780. In 10 minutes, ES drops 40 points. None of this was driven by new information — it was driven by the reflexive cascade of forced selling creating more forced selling.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Placing your stop at the same level as everyone else. If 10,000 traders all have stops at 5,800, the market has a 10,000-contract reason to go there. Think about where the crowd is positioned and place your stop where the crowd is not.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>When a move starts accelerating without new information, it is likely reflexive — driven by forced actions (stop cascades, margin calls, short covering). These moves tend to overshoot and then reverse. Do not chase them.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Reflexivity means the best opportunities come after the feedback loop exhausts itself. After a short squeeze runs out of shorts to cover, price reverses hard. After a long liquidation runs out of margin calls, price bounces hard. The end of the reflexive loop is where the next trade starts.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 21 — Positioning Dynamics
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-21" number={21} title="Positioning Dynamics" difficulty="institutional">
            <ConceptCard title="Reading the Room">
              <p>
                Before every trade, the institutional trader asks: who is in this room, and who is uncomfortable? The answer to this question predicts where price will go better than any chart pattern. Positioning dynamics is about understanding who holds what, where their pain points are, and when they will be forced to act.
              </p>
            </ConceptCard>

            <ConceptCard title="Who Is Trapped?">
              <p>
                Identify where participants entered and where their stops are. If the market rallied and everyone who bought in the last two hours has stops at 5,840, you know that a move below 5,840 will trigger forced selling. The market knows this too — and it will test that level.
              </p>
            </ConceptCard>

            <ConceptCard title="Who Is Forced?">
              <p>
                Forced participants do not have a choice — they must act regardless of price. This includes: margin calls (must sell), options expiration (must delta hedge), index rebalancing (must buy/sell specific stocks), and contract rollovers (must close and reopen). Forced flow is predictable flow, and predictable flow is tradeable flow.
              </p>
            </ConceptCard>

            <ConceptCard title="Who Is Uncomfortable?">
              <p>
                A trader who is up 50% on a position is comfortable. A trader who is down 10% and overleveraged is uncomfortable. Uncomfortable traders make bad decisions — they cut winners too early, hold losers too long, and panic at the wrong moments. When many participants are uncomfortable simultaneously, the market becomes volatile as their collective bad decisions create cascading price action.
              </p>
            </ConceptCard>

            <ConceptCard title="Where Must Traders Act?">
              <p>
                Certain price levels force action. The break-even level for large positions (where losers become winners or vice versa), margin call levels, and options strike prices with large open interest all create zones where participants must act. These zones generate reliable flow because the orders are not discretionary — they are mechanical.
              </p>
            </ConceptCard>

            <ExampleBox symbol="NQ" title="Reading the Positioning">
              <p>
                NQ has rallied 200 points over three days. The COT report shows that leveraged funds are extremely net long. Retail sentiment surveys are at 80% bullish. Put/call ratio is extremely low (everyone is buying calls). This positioning tells you: there are very few buyers left to push higher. Any catalyst that triggers selling will cascade because everyone is on the same side. The next meaningful move is more likely down than up — not because of any chart pattern, but because of who is holding what.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Trading purely on chart patterns without considering who is on the other side. A &ldquo;perfect bullish setup&rdquo; in a market where everyone is already long has no one left to buy. The best setups occur when positioning supports your trade direction — when the forced flow will be in your favor.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>After a strong trend, ask: is everyone already positioned in this direction? If yes, the trend is more likely to reverse or stall because the fuel (new buyers/sellers) is exhausted.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The best trades come when one side is forced to exit. A market that rallies into heavy short positioning will squeeze. A market that drops into heavy long positioning will cascade. Position yourself with the force, not against it.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 22 — Game Theory
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-22" number={22} title="Game Theory" difficulty="institutional">
            <ConceptCard title="The Market Is a Game Against Other Players">
              <p>
                Every trade has a counterparty. When you buy, someone sells to you. The market is not you vs. &ldquo;the market&rdquo; — it is you vs. every other participant. This means the same game theory principles that apply to poker, chess, and military strategy apply to trading.
              </p>
            </ConceptCard>

            <ConceptCard title="Retail Sees the Same Levels">
              <p>
                Every retail trader learns the same support/resistance concepts, sees the same obvious levels, and draws the same trendlines. This creates predictable behavior. When 100,000 traders all plan to buy at the same support level with stops just below, that creates a predictable cluster of orders — and someone with the capital to push through that level has a very profitable trade.
              </p>
            </ConceptCard>

            <ConceptCard title="Smart Money Knows What Retail Sees">
              <p>
                Institutions are not unaware of retail behavior — they study it. They know where retail puts stops. They know which patterns retail traders look for. They know that a &ldquo;head and shoulders&rdquo; on the chart will trigger a wave of selling from retail. This knowledge is used to create setups that exploit predictable retail behavior.
              </p>
            </ConceptCard>

            <ConceptCard title="Obvious Breakouts Become Traps">
              <p>
                A textbook breakout above resistance is what every trading course teaches you to buy. But precisely because it is textbook, it is predictable. Smart money can sell into the breakout buying, trigger a reversal, and profit from the stop cascade of all the breakout traders. The obvious trade is often the wrong trade because too many people are taking it.
              </p>
            </ConceptCard>

            <ConceptCard title="Second-Level Thinking">
              <p>
                First-level thinking: &ldquo;This is support, I should buy.&rdquo; Second-level thinking: &ldquo;Everyone sees this support. Their stops are all below it. What happens if it breaks?&rdquo; Third-level thinking: &ldquo;They expect the break. What if it breaks and immediately reverses, trapping the shorts?&rdquo;
              </p>
              <p>
                The market rewards second-level thinking. For every trade, ask: &ldquo;What are most traders expecting, and what happens if they are wrong?&rdquo;
              </p>
            </ConceptCard>

            <MiniDiagram title="Levels of Thinking">
{`  LEVEL 1:  "Support → Buy"
            (what retail does)

  LEVEL 2:  "Everyone buys support → Sweep it → Short"
            (what smart money does)

  LEVEL 3:  "They'll sweep → but then fail → reversal long"
            (what the best traders do)

  KEY: Ask "what do most people expect, and what
       happens if they are wrong?"`}
            </MiniDiagram>

            <ExampleBox symbol="ES" title="The Trap Within the Trap">
              <p>
                ES has a clear double bottom at 5,800. Every trader sees it. Level 1 traders buy it. Price drops below 5,800 — Level 2 traders short the breakdown, targeting stops. But the breakdown only lasts 3 candles before price reverses aggressively above 5,800 with massive displacement. The Level 2 shorts are now trapped. Level 3 traders, who waited for the sweep and the displacement, enter long and ride the move 30 points higher, fueled by the trapped shorts covering.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Always being contrarian for the sake of being contrarian. Game theory does not mean &ldquo;do the opposite of everyone.&rdquo; It means understand what everyone expects, evaluate whether the expected outcome is priced in, and find the scenarios where the crowd is vulnerable. Sometimes the crowd is right. Game theory helps you know when it is not.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Before entering any trade at an obvious level, pause and ask: if I can see this level, can everyone else? If yes, what happens to all the traders who enter here if the level fails?</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The highest-probability trades in game theory terms are asymmetric: low risk, high reward, triggered by the crowd being wrong. A sweep of a widely-watched level followed by displacement in the opposite direction is the game theory trade — you are profiting from the crowd&rsquo;s mistake.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 23 — Adaptive Systems
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-23" number={23} title="Adaptive Systems" difficulty="institutional">
            <ConceptCard title="Markets Change">
              <p>
                The market you traded last year is not the same market you are trading today. Volatility regimes shift, participant composition changes, algorithmic strategies evolve, and regulatory environments update. A strategy that produced consistent profits in 2024 may lose money in 2026 — not because it was wrong, but because the market adapted.
              </p>
            </ConceptCard>

            <ConceptCard title="Strategies Decay">
              <p>
                Every strategy has a lifespan. As more participants discover and trade a strategy, its edge erodes. The original signal gets crowded out, execution gets worse, and the counterparties adapt. This is alpha decay — the natural entropy of profitable strategies. The response is not to find the &ldquo;perfect&rdquo; strategy, but to continuously adapt.
              </p>
            </ConceptCard>

            <ConceptCard title="Regime Shifts">
              <p>
                The market periodically shifts between regimes: low volatility to high volatility, trending to mean-reverting, correlated to decorrelated. Each regime favors different strategies. The trader who can identify regime shifts early and adjust their approach has a sustainable edge. The trader who clings to one approach in all regimes blows up eventually.
              </p>
            </ConceptCard>

            <ConceptCard title="Adapt to Environment, Do Not Force One Model">
              <p>
                The best traders are like water — they take the shape of their container. In a trending market, they trend-follow. In a range, they fade extremes. In a news-driven environment, they wait for the dust to settle. They do not have one rigid model that they force onto every market condition.
              </p>
              <p>
                This does not mean changing your strategy every day. It means having a framework that accounts for different environments and knowing when to activate each mode.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES/NQ" title="When Your Edge Disappears">
              <p>
                Your strategy works by buying bullish FVGs in trending markets. For three months, it produces consistent wins. Then the market shifts to a range-bound, positive-gamma environment. Your FVG entries keep getting chopped up because the market reverses at every extension. Instead of forcing more trades, you recognize the regime shift: reduce size, switch to range-fading strategies, or sit out until the regime changes. The strategy is not broken — the environment changed.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Blaming your strategy when it stops working, instead of assessing whether the market environment changed. Strategies do not &ldquo;stop working&rdquo; randomly — the environment they were designed for shifts. Diagnose the regime, not the strategy.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Keep a journal that tracks not just your trades, but the market environment. Note: was it trending or ranging? High or low volatility? When you have a losing streak, check whether the environment changed rather than assuming your analysis is wrong.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>Build your trading framework as a system of systems. Have a trend model, a range model, and a volatility model. Know which one to deploy based on the current regime. Your edge is not in any single model — it is in your ability to match the right model to the right environment.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 24 — Professional Price Action Framework
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-24" number={24} title="Professional Price Action Framework" difficulty="institutional">
            <ConceptCard title="The Complete Framework">
              <p>
                Everything in this guide converges into a single decision framework. Before every trade, evaluate these seven dimensions. If most align, you have a high-probability setup. If only a few align, reduce size or wait.
              </p>
            </ConceptCard>

            <MiniDiagram title="The Seven Dimensions">
{`  ┌─────────────────────────────────────────────────────┐
  │          PROFESSIONAL PRICE ACTION FRAMEWORK          │
  ├─────────────────────────────────────────────────────┤
  │                                                       │
  │  1. STATE        What is the market doing?            │
  │                  Trend / Range / Transition            │
  │                                                       │
  │  2. LOCATION     Where is price?                      │
  │                  Premium / Discount / PDA / Level      │
  │                                                       │
  │  3. LIQUIDITY    What pool is targeted?               │
  │                  BSL / SSL / Internal / External       │
  │                                                       │
  │  4. PRESSURE     What is the urgency?                 │
  │                  Velocity / Displacement / Volume      │
  │                                                       │
  │  5. TIME         When is this happening?              │
  │                  Session / Day type / OPEX / News      │
  │                                                       │
  │  6. ACCEPTANCE   Is this accepted or rejected?        │
  │                  Time at level / Candle quality        │
  │                                                       │
  │  7. POSITIONING  Who is trapped or forced?            │
  │                  Stops / Margin / Sentiment            │
  │                                                       │
  └─────────────────────────────────────────────────────┘`}
            </MiniDiagram>

            <ConceptCard title="1. State">
              <p>
                Is the market trending, ranging, or transitioning? This determines your strategy type. Trending = trade with the trend on pullbacks to PDAs. Ranging = fade extremes or wait. Transitioning = reduced size, wait for clarity. Do not trade a range strategy in a trend or vice versa.
              </p>
            </ConceptCard>

            <ConceptCard title="2. Location">
              <p>
                Where is price relative to the structure? Are you in premium or discount? Is price at a PDA, a liquidity pool, or in no-man&rsquo;s-land (middle of the range)? The best entries come at key locations — PDA confluence zones in premium (for shorts) or discount (for longs).
              </p>
            </ConceptCard>

            <ConceptCard title="3. Liquidity">
              <p>
                What liquidity target is the market pursuing? Has buy-side liquidity been taken? Is sell-side liquidity the next target? After a liquidity sweep, the market often reverses to target the other side. Know which pool was just hit and which is next.
              </p>
            </ConceptCard>

            <ConceptCard title="4. Pressure">
              <p>
                What is the velocity and quality of the current move? Strong displacement with large candle bodies and small wicks indicates genuine pressure. Slow, grinding movement with overlapping candles indicates weak pressure. You want to trade in the direction of genuine pressure, not fight it.
              </p>
            </ConceptCard>

            <ConceptCard title="5. Time">
              <p>
                Is this the right time for this trade? Morning execution window (9:30-11:00) for fresh setups. Avoid lunch chop (11:30-1:30). Power hour (3:00-4:00) for continuation. Is it OPEX week? FOMC day? CPI? The time context changes the probability of any setup.
              </p>
            </ConceptCard>

            <ConceptCard title="6. Acceptance">
              <p>
                Has the market accepted or rejected the current price level? Acceptance = multiple candles, volume, time spent at the level. Rejection = fast displacement away, long wicks, immediate reversal. Trade with acceptance. Trade the reaction to rejection. Do not trade ambiguity.
              </p>
            </ConceptCard>

            <ConceptCard title="7. Positioning">
              <p>
                Who is trapped? Who is forced? Where are the stops? If you go long, whose forced buying or covering will add to your trade? If you go short, whose liquidation will fuel the move? The best trades are those where the positioning of other participants works in your favor.
              </p>
            </ConceptCard>

            <ExampleBox symbol="ES" title="The Framework in Action">
              <p>
                <strong>State:</strong> Daily and 1H are bearish (lower highs, lower lows). <strong>Location:</strong> Price has rallied to a 1H bearish FVG in premium. <strong>Liquidity:</strong> Buy-side above overnight high was just swept. <strong>Pressure:</strong> The last down-move showed strong displacement (large candles, small wicks). <strong>Time:</strong> 10:15 AM — morning session, best execution window. <strong>Acceptance:</strong> Price is rejecting the premium zone with a large upper wick. <strong>Positioning:</strong> Breakout buyers who chased the overnight high sweep are now trapped above.
              </p>
              <p>
                All seven dimensions align for a short. This is as high-probability as it gets. Enter short with a stop above the liquidity sweep high, targeting discount.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Taking trades when only one or two dimensions align. &ldquo;There is an FVG&rdquo; is not enough (that is just location). You need state + location + at least three other dimensions to have a framework-quality trade. Anything less is gambling.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Print the seven dimensions and check them before every trade. Literally go through the checklist. Over time, it becomes intuition, but start with the checklist.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The framework is not a formula — it is a lens. Some dimensions carry more weight depending on the environment. In a strong trend, state and pressure dominate. In a range, location and liquidity dominate. Near OPEX, time and positioning dominate. Master the framework, then learn which dimensions matter most in each context.</p>
            </TakeawayBox>
          </LayerSection>

          {/* ═══════════════════════════════════════════════════════
             LAYER 25 — Practical Trading Copilot Rules
             ═══════════════════════════════════════════════════════ */}
          <LayerSection id="layer-25" number={25} title="Practical Trading Copilot Rules" difficulty="institutional">
            <ConceptCard title="Rules That Protect You">
              <p>
                Knowledge without discipline is useless. You can understand all 24 layers above and still lose money if you do not have clear, executable rules that protect you from yourself. These rules are distilled from thousands of trades and hundreds of mistakes.
              </p>
            </ConceptCard>

            <div className="rounded-lg border border-[#5ba3e6]/30 bg-[#5ba3e6]/5 p-5">
              <h3 className="mb-4 text-base font-semibold text-[#5ba3e6]">The Rules</h3>
              <div className="space-y-3 text-sm leading-relaxed text-[#c0c0c0]">
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">1</span>
                  <div><strong className="text-white">Do not trade the 5M alone.</strong> The 5-minute chart is for entry timing only. Your analysis happens on 15M, 1H, and higher. If you are making decisions based on 5M candles without higher-timeframe context, you are trading noise.</div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">2</span>
                  <div><strong className="text-white">No trade unless 15M agrees with 1H.</strong> This is the multi-timeframe alignment rule. If the 1H is bearish and the 15M shows a bullish setup, skip it. Wait for alignment. This single rule eliminates most losing trades.</div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">3</span>
                  <div><strong className="text-white">Do not buy into a bearish PDA.</strong> If a bearish FVG or order block is directly above, you are buying into resistance. Wait for it to break or look for a better location.</div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">4</span>
                  <div><strong className="text-white">Do not sell into a bullish PDA.</strong> The mirror image. Do not short into a bullish FVG or order block below. Respect the level or wait for it to break.</div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">5</span>
                  <div><strong className="text-white">Avoid the middle of the range.</strong> The worst place to enter a trade is the middle of a range — maximum distance from both support and resistance, no edge, maximum exposure to chop. Wait for price to reach an extreme.</div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">6</span>
                  <div><strong className="text-white">After a loss: cooldown.</strong> After a losing trade, take a 15-30 minute break. Do not immediately re-enter. Losses trigger emotional responses that degrade decision-making. The cooldown lets your rational brain catch up.</div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">7</span>
                  <div><strong className="text-white">Maximum 3 trades per day.</strong> Quality over quantity. Most losing traders take 10-15 trades per day and lose on 8-10 of them. Three well-planned trades with proper framework alignment will outperform 15 impulse trades over any timeframe.</div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">8</span>
                  <div><strong className="text-white">Wait for the full setup: Liquidity + MSS + Displacement + FVG + Retest.</strong> The complete entry model requires all five elements. Liquidity is swept, a market structure shift occurs, displacement creates an FVG, and you enter on the retest of that FVG. Skip any element and you are taking a lower-probability trade.</div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">9</span>
                  <div><strong className="text-white">Trade less, but better.</strong> Your edge comes from selectivity, not activity. Every trade you skip that does not meet your criteria is a win — you avoided a potential loss. The best traders are characterized by patience, not frequency.</div>
                </div>
              </div>
            </div>

            <MiniDiagram title="The Complete Entry Model">
{`  Step 1          Step 2          Step 3          Step 4          Step 5
  ┌──────┐        ┌──────┐        ┌──────┐        ┌──────┐        ┌──────┐
  │LIQUID│   →    │ MSS  │   →    │DISPL.│   →    │ FVG  │   →    │RETEST│
  │SWEEP │        │SHIFT │        │      │        │FORMS │        │ENTRY │
  └──────┘        └──────┘        └──────┘        └──────┘        └──────┘
  Price takes     Structure       Strong candle   Gap created     Price returns
  out stops       breaks          with body >     between         to FVG →
  at key level    (higher low     avg, small      candles         you enter
                  or lower high)  wicks                           with stop
                                                                  below FVG`}
            </MiniDiagram>

            <ExampleBox symbol="ES" title="Putting It All Together">
              <p>
                <strong>9:35 AM:</strong> ES drops and sweeps the overnight low at 5,830 (Step 1: liquidity sweep). <strong>9:42 AM:</strong> On the 15M, price makes a higher low after the sweep — structure shifts bullish (Step 2: MSS). <strong>9:45 AM:</strong> A large bullish candle with body 2x the average drives from 5,832 to 5,845 (Step 3: displacement). The move creates a bullish FVG between 5,836 and 5,840 (Step 4: FVG forms). <strong>9:55 AM:</strong> Price retraces to 5,838, entering the FVG. You go long at 5,838 with a stop at 5,828 (below the sweep low). Target: premium above at the previous day high.
              </p>
              <p>
                This trade has all five elements, multi-timeframe alignment (1H is bullish), favorable time (morning session), and positioning advantage (shorts who sold the overnight low are now trapped). This is the framework in action.
              </p>
            </ExampleBox>

            <MistakeBox>
              <p>
                Knowing the rules and not following them. Every trader who has been at it long enough knows what they should do. The difference between profitable and unprofitable traders is not knowledge — it is execution. Write the rules down. Check them before every trade. Hold yourself accountable.
              </p>
            </MistakeBox>

            <TakeawayBox level="beginner">
              <p>Start with Rule 7 (max 3 trades) and Rule 2 (15M must agree with 1H). These two rules alone will transform your trading by forcing selectivity and alignment.</p>
            </TakeawayBox>

            <TakeawayBox level="advanced">
              <p>The rules are not constraints — they are a competitive advantage. In a game where most participants lose because of overtrading, emotional reactions, and lack of framework, having clear rules and the discipline to follow them puts you in a small minority. The rules are the edge.</p>
            </TakeawayBox>
          </LayerSection>
        </div>

        {/* Disclaimer */}
        <div className="mt-12 rounded-lg border border-[#2a2a2a] bg-[#141414] p-5 text-center">
          <p className="text-xs leading-relaxed text-[#666]">
            This content is for educational and journaling purposes only. It is not financial advice and does not guarantee trading outcomes. Past performance does not indicate future results. Trading futures and equities involves substantial risk of loss. Only risk capital you can afford to lose.
          </p>
        </div>
      </div>

    </div>
  );
}
