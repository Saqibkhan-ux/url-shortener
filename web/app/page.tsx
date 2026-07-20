"use client";

import { useState } from "react";
import CreateLinkForm from "@/components/CreateLinkForm";
import LinkList from "@/components/LinkList";

export default function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <main className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">TinyLink</h1>
        <p className="mt-1 text-slate-500">
          Base62-encoded short links with real-time click analytics.
        </p>
      </header>

      <section>
        <CreateLinkForm onCreated={() => setRefreshKey((k) => k + 1)} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
          Recent links
        </h2>
        <LinkList refreshKey={refreshKey} />
      </section>
    </main>
  );
}
