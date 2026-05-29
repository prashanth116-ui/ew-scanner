import type { Metadata } from "next";
import { CalendarClient } from "./calendar-client";

export const metadata: Metadata = {
  title: "Earnings Calendar",
  description:
    "Weekly and monthly view of upcoming earnings dates for all stocks. Powered by Finnhub.",
};

export default function CalendarPage() {
  return <CalendarClient />;
}
