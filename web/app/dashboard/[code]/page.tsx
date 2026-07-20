import Link from "next/link";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";

export default function DashboardPage({ params }: { params: { code: string } }) {
  return (
    <main className="space-y-6">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">
        ← Back to all links
      </Link>

      <header>
        <h1 className="text-2xl font-bold">
          Analytics for <span className="text-indigo-400">/{params.code}</span>
        </h1>
      </header>

      <AnalyticsDashboard code={params.code} />
    </main>
  );
}
