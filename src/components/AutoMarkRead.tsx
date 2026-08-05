"use client";

// Marks a message thread read once, when the viewer opens it. Renders nothing.

import { useEffect, useRef } from "react";
import { markThreadRead } from "@/lib/messaging-actions";

export function AutoMarkRead({ studentId }: { studentId: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void markThreadRead(studentId);
  }, [studentId]);
  return null;
}
