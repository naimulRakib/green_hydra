"use client";
/**
 * DashboardTabs — client component for tab navigation.
 * Updates URL search param ?tab= so the server re-renders with correct tab.
 * No full page reload — Next.js App Router handles it as a soft navigation.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";


const TABS = [
  { id: "overview", label: "🏠 ওভারভিউ" },
  { id: "land",     label: "🗺️ জমি নিবন্ধন" },
  { id: "survey",   label: "📋 সাপ্তাহিক সার্ভে" },
] as const;

type TabId = typeof TABS[number]["id"];

export default function DashboardTabs({ active }: { active: TabId }) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  function navigate(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex gap-0 -mb-px overflow-x-auto">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => navigate(tab.id)}
          className={[
            "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
            active === tab.id
              ? "border-green-600 text-green-700 bg-white"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}