"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const DEPARTMENTS = ["IT", "Contracts", "HR", "Operations", "Finance", "Other"];
const ROLES = ["Admin", "Manager", "Team Lead", "Member", "Contractor"];

export default function OnboardingPage() {
  const { user } = useUser();
  const router = useRouter();
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!department || !role) {
      setError("Both fields are required.");
      return;
    }
    setSaving(true);
    try {
      await user?.update({
        unsafeMetadata: { department, role, onboarded: true },
      });
      // Force a full reload so the session token picks up the new metadata
      window.location.href = "/";
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-white font-semibold text-xl tracking-tight">Vigil</span>
          <h1 className="text-2xl font-semibold text-white mt-4 mb-1">One quick thing</h1>
          <p className="text-zinc-500 text-sm">Tell us about your role so Vigil can personalise your experience.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 text-white text-sm px-3 py-2.5 outline-none focus:border-white/20 appearance-none"
            >
              <option value="" disabled className="bg-zinc-900">Select department...</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d} className="bg-zinc-900">{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 text-white text-sm px-3 py-2.5 outline-none focus:border-white/20 appearance-none"
            >
              <option value="" disabled className="bg-zinc-900">Select role...</option>
              {ROLES.map((r) => (
                <option key={r} value={r} className="bg-zinc-900">{r}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving || !department || !role}
            className="w-full rounded-xl bg-white text-black text-sm font-medium py-2.5 disabled:opacity-40 transition-opacity mt-2"
          >
            {saving ? "Saving..." : "Continue →"}
          </button>
        </form>
      </div>
    </div>
  );
}
