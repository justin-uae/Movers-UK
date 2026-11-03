"use client";

import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");

  const notify = useCallback((m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(""), 2600);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {message && (
        <div className="fixed top-5 right-5 z-[100] rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
          {message}
        </div>
      )}
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
