import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <article className="prose-invert mx-auto max-w-2xl space-y-6 text-sm text-[#a0a0a0]">
      <h1 className="text-xl font-bold text-white">Terms of Service</h1>
      <p className="text-xs text-[#555]">Last updated: April 2026</p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          1. Acceptance of Terms
        </h2>
        <p>
          By accessing or using EW Scanner (&quot;the Service&quot;), you agree
          to be bound by these Terms of Service. If you do not agree, do not use
          the Service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          2. Description of Service
        </h2>
        <p>
          EW Scanner provides algorithmic Elliott Wave analysis, squeeze
          detection, and pre-run scanning tools for educational and
          informational purposes. The Service includes free and paid tiers with
          AI-powered analysis features.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">3. Accounts</h2>
        <p>
          You may create an account using email or Google OAuth. You are
          responsible for maintaining the security of your account credentials.
          You must provide accurate information when creating an account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          4. Subscriptions and Billing
        </h2>
        <p>
          Paid subscriptions are billed monthly via Stripe. You may cancel at
          any time through the billing portal. Upon cancellation, you retain
          access until the end of your current billing period. Refunds are not
          provided for partial months.
        </p>
        <p>
          We reserve the right to change pricing with 30 days notice. Existing
          subscribers will be notified via email before any price changes take
          effect.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          5. Acceptable Use
        </h2>
        <p>You agree not to:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Use the Service for any unlawful purpose</li>
          <li>Attempt to reverse-engineer or scrape the Service</li>
          <li>Share your account credentials with others</li>
          <li>
            Use automated tools to access the Service beyond provided APIs
          </li>
          <li>Redistribute AI-generated analyses commercially</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          6. Not Financial Advice
        </h2>
        <p>
          <strong className="text-white">
            The Service does not provide financial, investment, or trading
            advice.
          </strong>{" "}
          All analyses, scores, and labels are algorithmically generated for
          educational purposes only. See our{" "}
          <a href="/disclaimer" className="text-[#5ba3e6] hover:underline">
            Financial Disclaimer
          </a>{" "}
          for full details.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          7. Limitation of Liability
        </h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any
          kind. We are not liable for any trading losses, investment decisions,
          or damages arising from use of the Service. In no event shall our
          total liability exceed the amount paid by you in the preceding 12
          months.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          8. Intellectual Property
        </h2>
        <p>
          All content, algorithms, and branding are owned by EW Scanner. You
          retain ownership of your data (watchlists, saved scans, preferences).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">9. Termination</h2>
        <p>
          We may suspend or terminate your account for violation of these Terms.
          You may delete your account at any time. Upon deletion, your data will
          be permanently removed.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">
          10. Changes to Terms
        </h2>
        <p>
          We may update these Terms at any time. Continued use of the Service
          after changes constitutes acceptance of the new Terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white">11. Contact</h2>
        <p>
          For questions about these Terms, contact us at{" "}
          <a href="mailto:support@ewscanner.com" className="text-[#5ba3e6] hover:underline">
            support@ewscanner.com
          </a>
          .
        </p>
      </section>
    </article>
  );
}
