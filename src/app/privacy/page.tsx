import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article className="prose-invert mx-auto max-w-2xl space-y-6 text-sm text-[#a0a0a0]">
      <h1 className="text-xl font-bold text-white">Privacy Policy</h1>
      <p className="text-xs text-[#555]">Last updated: April 2026</p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          1. Information We Collect
        </h2>
        <h3 className="text-sm font-medium text-white">Account Data</h3>
        <p>
          When you create an account, we collect your email address and
          authentication provider (Google or magic link). We do not store
          passwords.
        </p>
        <h3 className="text-sm font-medium text-white">Usage Data</h3>
        <p>
          We track feature usage counts (number of AI analyses, scans, etc.) to
          enforce plan limits. We do not track which specific tickers you
          analyze.
        </p>
        <h3 className="text-sm font-medium text-white">User Content</h3>
        <p>
          Watchlists, saved scans, and preferences are stored in our database
          and associated with your account. This data is only accessible to you.
        </p>
        <h3 className="text-sm font-medium text-white">Payment Data</h3>
        <p>
          Payment processing is handled entirely by Stripe. We store your Stripe
          customer ID and subscription status but never see or store your credit
          card details.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          2. How We Use Your Data
        </h2>
        <ul className="list-inside list-disc space-y-1">
          <li>To provide and maintain the Service</li>
          <li>To enforce usage limits based on your subscription tier</li>
          <li>To process payments via Stripe</li>
          <li>To send transactional emails (account verification, receipts)</li>
        </ul>
        <p>
          We do <strong className="text-white">not</strong> sell your data to
          third parties. We do <strong className="text-white">not</strong> use
          your data for advertising. We do{" "}
          <strong className="text-white">not</strong> share your data with
          anyone except as required to provide the Service (Supabase for
          database, Stripe for payments, Anthropic for AI analysis).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          3. Third-Party Services
        </h2>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong className="text-white">Supabase</strong> — Authentication
            and database hosting
          </li>
          <li>
            <strong className="text-white">Stripe</strong> — Payment processing
          </li>
          <li>
            <strong className="text-white">Anthropic (Claude)</strong> — AI
            analysis generation
          </li>
          <li>
            <strong className="text-white">Vercel</strong> — Application
            hosting
          </li>
        </ul>
        <p>
          Each of these services has their own privacy policy. When you use AI
          analysis features, the stock data you submit (ticker, price, technical
          indicators) is sent to Anthropic for processing. Anthropic does not
          use this data for training.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          4. Data Storage and Security
        </h2>
        <p>
          Your data is stored in Supabase (hosted on AWS) with Row Level
          Security (RLS) policies ensuring only you can access your own data.
          All data is encrypted in transit (TLS) and at rest.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          5. Local Storage
        </h2>
        <p>
          If you use the Service without an account, your watchlists and
          preferences are stored locally in your browser (localStorage). This
          data never leaves your device unless you create an account and opt to
          sync it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          6. Data Retention
        </h2>
        <p>
          Your account data is retained as long as your account is active. If
          you delete your account, all associated data (watchlists, scans,
          preferences, usage records) is permanently deleted within 30 days.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">7. Your Rights</h2>
        <p>You have the right to:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Access your data (via the export feature)</li>
          <li>Delete your account and all associated data</li>
          <li>Request a copy of your data</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">8. Cookies</h2>
        <p>
          We use essential cookies only for authentication session management.
          We do not use tracking cookies, analytics cookies, or advertising
          cookies.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          9. Changes to This Policy
        </h2>
        <p>
          We may update this Privacy Policy at any time. We will notify
          registered users via email of material changes.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">10. Contact</h2>
        <p>
          For privacy-related questions, contact us at{" "}
          <a href="mailto:support@ewscanner.com" className="text-[#5ba3e6] hover:underline">
            support@ewscanner.com
          </a>
          .
        </p>
      </section>
    </article>
  );
}
