import type { Metadata } from "next";
import { EarningsClient } from "./earnings-client";

export const metadata: Metadata = {
  title: "Earnings",
  description:
    "Look up earnings history, EPS estimates, and upcoming earnings dates for any stock. Free data from Yahoo Finance.",
};

export default function EarningsPage() {
  return <EarningsClient />;
}
