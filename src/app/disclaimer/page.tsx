import type { Metadata } from "next";

export const metadata: Metadata = { title: "Financial Disclaimer" };

export default function DisclaimerPage() {
  return (
    <article className="prose-invert mx-auto max-w-2xl space-y-6 text-sm text-[#a0a0a0]">
      <h1 className="text-xl font-bold text-white">Financial Disclaimer</h1>
      <p className="text-xs text-[#555]">Last updated: April 2026</p>

      <section className="space-y-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
        <p className="font-medium text-yellow-200">
          EW Scanner is NOT a registered investment advisor, broker-dealer, or
          financial planner. The information provided by this Service does not
          constitute financial advice, investment advice, trading advice, or any
          other sort of advice.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          1. Educational Purpose Only
        </h2>
        <p>
          All content provided by EW Scanner — including wave counts, scores,
          labels, AI analyses, price targets, and risk assessments — is for
          educational and informational purposes only. None of this content
          should be construed as a recommendation to buy, sell, or hold any
          security.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          2. No Guarantee of Accuracy
        </h2>
        <p>
          Elliott Wave analysis is inherently subjective. Our algorithmic wave
          counting and AI-powered analyses are automated interpretations that
          may be incorrect. Wave counts can change as new price data becomes
          available. Past patterns do not guarantee future results.
        </p>
        <p>
          AI-generated analyses (powered by Anthropic Claude) are probabilistic
          outputs, not deterministic facts. They may contain errors,
          hallucinations, or outdated information.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          3. Risk of Loss
        </h2>
        <p>
          <strong className="text-white">
            Trading and investing in securities involves substantial risk of
            loss.
          </strong>{" "}
          You should only trade with money you can afford to lose. The
          performance of any trading strategy, analysis, or signal should not be
          considered indicative of future results.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          4. Your Responsibility
        </h2>
        <p>
          You are solely responsible for your own investment decisions. Before
          making any investment, you should:
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>Consult with a qualified financial advisor</li>
          <li>Conduct your own independent research</li>
          <li>Consider your risk tolerance and financial situation</li>
          <li>
            Understand that you may lose some or all of your invested capital
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          5. Data Sources
        </h2>
        <p>
          Market data is sourced from third-party providers and may be delayed
          or inaccurate. We do not guarantee the timeliness, accuracy, or
          completeness of any market data displayed on the Service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          6. No Fiduciary Relationship
        </h2>
        <p>
          Use of the Service does not create a fiduciary relationship between
          you and EW Scanner. We owe no duty to any user to act in their best
          interest regarding trading or investment decisions.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          7. Hypothetical Performance
        </h2>
        <p>
          Any backtest results, historical analyses, or performance statistics
          shown are hypothetical and do not represent actual trading. Hypothetical
          results have many inherent limitations including hindsight bias.
        </p>
      </section>
    </article>
  );
}
