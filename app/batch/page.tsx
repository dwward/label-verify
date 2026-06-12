"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BatchPage() {
  const router = useRouter();

  useEffect(() => {
    router.push("/");
  }, [router]);

  return (
    <div className="container mx-auto px-4 py-8">
      <p>Redirecting to unified queue interface...</p>
    </div>
  );
}
