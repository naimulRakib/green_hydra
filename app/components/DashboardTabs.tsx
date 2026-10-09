"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { id: "overview",   label: "Overview" },
  { id: "land",       label: "Land Registry" },
  { id: "survey",     label: "Field Survey" },
  { id: "pollution",  label: "Pollution Report" },
  { id: "risk",       label: "Risk Assessment" },
  { id: "scan",       label: "Diagnostic Scan" },
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
    <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', overflowX: 'auto', gap: 0, marginTop: '4px' }}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => navigate(tab.id)}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: active === tab.id ? 600 : 500,
            color: active === tab.id ? 'var(--primary)' : 'var(--text-muted)',
            background: 'transparent',
            border: 'none',
            borderBottom: `2px solid ${active === tab.id ? 'var(--primary)' : 'transparent'}`,
            marginBottom: '-2px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
