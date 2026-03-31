"use client";
/**
 * EFFIBOOKS — Onboarding Success Page
 * app/onboarding/success/page.jsx
 *
 * Shown immediately after Shopify OAuth completes.
 * Sprint 1 end state: "Connection Successful! We're syncing your last 30 days…"
 *
 * This page:
 * 1. Confirms the Shopify connection with the store name
 * 2. Shows an animated sync progress while we kick off the initial data pull
 * 3. Transitions to "Next Step: Connect Stripe" after 3 seconds
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const STEPS = [
  { id: "auth",    label: "Shopify connection verified",         delay: 0    },
  { id: "orders",  label: "Fetching last 30 days of orders…",    delay: 800  },
  { id: "calc",    label: "Calculating gross revenue…",          delay: 1800 },
  { id: "fees",    label: "Identifying platform fees…",          delay: 2800 },
  { id: "ready",   label: "Initial analysis complete",           delay: 3800 },
];

function SuccessContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") || "your-store.myshopify.com";
  const name = decodeURIComponent(searchParams.get("name") || shop);

  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [showNext, setShowNext] = useState(false);

  useEffect(() => {
    // Trigger each step completion on its delay
    STEPS.forEach(({ id, delay }) => {
      setTimeout(() => {
        setCompletedSteps((prev) => new Set([...prev, id]));
      }, delay);
    });

    // Show "Next Step" CTA after all steps complete
    setTimeout(() => setShowNext(true), 4600);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F7F3ED",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 20,
        border: "1.5px solid #DDD6CE",
        padding: "48px 44px",
        maxWidth: 500,
        width: "100%",
        boxShadow: "0 8px 40px rgba(27,67,50,0.1)",
      }}>
        {/* Success badge */}
        <div style={{
          width: 64, height: 64,
          background: "#D8F3DC",
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, marginBottom: 24,
          border: "2px solid #2D6A4F",
        }}>
          ✓
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.02em", color: "#0D1117" }}>
          Connection successful!
        </h1>
        <p style={{ fontSize: 15, color: "#6B7280", margin: "0 0 32px", lineHeight: 1.6 }}>
          Effibooks is now syncing with{" "}
          <strong style={{ color: "#1B4332" }}>{name}</strong>.
          We're analyzing your last 30 days of orders.
        </p>

        {/* Sync progress steps */}
        <div style={{ marginBottom: 32 }}>
          {STEPS.map(({ id, label }) => {
            const done = completedSteps.has(id);
            const active = !done && completedSteps.size === STEPS.findIndex(s => s.id === id);
            return (
              <div key={id} style={{
                display: "flex", gap: 12, alignItems: "center",
                padding: "9px 0",
                borderBottom: "1px solid #F7F3ED",
                opacity: done || active ? 1 : 0.35,
                transition: "opacity 0.4s ease",
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: done ? "#1B4332" : "transparent",
                  border: done ? "none" : "2px solid #DDD6CE",
                  transition: "all 0.3s",
                }}>
                  {done && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
                  {!done && (
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: active ? "#C9952A" : "#DDD6CE",
                      animation: active ? "pulse 1s ease infinite" : "none",
                    }} />
                  )}
                </div>
                <span style={{ fontSize: 14, color: done ? "#1B4332" : "#6B7280", fontWeight: done ? 600 : 400 }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Next step CTA — appears after sync animation */}
        <div style={{
          opacity: showNext ? 1 : 0,
          transform: showNext ? "translateY(0)" : "translateY(8px)",
          transition: "all 0.5s ease",
        }}>
          <div style={{
            background: "#F7F3ED",
            borderRadius: 12, padding: "16px 18px", marginBottom: 16,
            border: "1px solid #DDD6CE",
          }}>
            <div style={{ fontSize: 12, color: "#C9952A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Next Step
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0D1117" }}>Connect Stripe to unlock your real profit number</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
              Without Stripe, we can estimate fees. With it, we show the exact dollar amount you kept.
            </div>
          </div>

          <a href="/onboarding/stripe" style={{
            display: "block", width: "100%",
            background: "#1B4332", color: "#fff",
            padding: "14px 20px",
            borderRadius: 10, textAlign: "center",
            fontSize: 15, fontWeight: 600,
            textDecoration: "none",
            transition: "background 0.15s",
          }}>
            Connect Stripe →
          </a>
          <a href="/dashboard" style={{
            display: "block", textAlign: "center",
            fontSize: 13, color: "#9CA3AF",
            marginTop: 12, textDecoration: "none",
          }}>
            Skip for now — show me my Shopify data
          </a>
        </div>
      </div>
    </div>
  );
}

//Page export is now this function, not the default SuccessContent, to avoid confusion with the main export of this file.
export default function OnboardingSuccess() {
  return(
    <Suspense fallback={<div>Loading...</div>}>
      <SuccessContent />
    </Suspense>
  )
}
