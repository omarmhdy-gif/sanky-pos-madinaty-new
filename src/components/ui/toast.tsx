"use client";

import React, { useEffect } from "react";
import { create } from "zustand";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, variant = "success") =>
    set((state) => ({
      toasts: [...state.toasts, { id: Math.random().toString(36).slice(2), message, variant }],
    })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, variant: ToastVariant = "success") {
  useToastStore.getState().push(message, variant);
}

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const styles = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-primary/30 bg-primary/10 text-primary",
};

function ToastCard({ t }: { t: ToastItem }) {
  const { dismiss } = useToastStore();
  const Icon = icons[t.variant];

  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), 3200);
    return () => clearTimeout(timer);
  }, [t.id, dismiss]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg bg-background animate-slide-up min-w-[280px] max-w-sm",
        styles[t.variant]
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <p className="text-sm font-medium text-foreground flex-1">{t.message}</p>
      <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts } = useToastStore();
  return (
    <div className="fixed bottom-4 end-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard t={t} />
        </div>
      ))}
    </div>
  );
}
