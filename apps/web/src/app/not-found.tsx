import Link from "next/link";
import { Ship } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-8">
      <Ship className="w-10 h-10 text-primary mb-4" />
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="text-muted-foreground mb-6">This page doesn&apos;t exist or you don&apos;t have access.</p>
      <Link href="/dashboard" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors">
        Back to dashboard
      </Link>
    </div>
  );
}
