import { CatalystManager } from "@/components/catalyst-manager";

export const metadata = {
  title: "Catalysts",
  description: "Dated events the scanners cannot see",
};

export default function CatalystsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold text-white">Catalysts</h1>
      <p className="mb-6 max-w-2xl text-sm text-[#a0a0a0]">
        Dated events no price scanner can see — a readout, an earnings date, a court
        ruling. Nothing derived from OHLCV predicts these, and nothing here pretends to.
        What this does is put the date in front of you before it arrives, so a position is
        sized deliberately rather than by surprise.
      </p>
      <p className="mb-6 max-w-2xl text-xs text-[#707070]">
        A catalyst within 5 days promotes a focus name into the nightly alert even when
        the scanners have not agreed on it. That is deliberate: the tier measures how much
        the scanners concur, and they cannot see a readout date at all — so their agreement
        is the wrong test for exactly the case where you most need reminding.
      </p>
      <CatalystManager />
    </main>
  );
}
