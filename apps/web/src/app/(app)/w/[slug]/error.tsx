"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 text-center p-8">
      <AlertCircle className="w-8 h-8 text-destructive mb-3" />
      <h2 className="font-semibold mb-1">Something went wrong</h2>
      <p className="text-muted-foreground text-sm mb-4">{error.message || "An unexpected error occurred"}</p>
      <button
        onClick={reset}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
