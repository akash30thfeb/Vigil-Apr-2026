import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { LoggedToast } from "@/components/LoggedToast";
import { ChatDrawer } from "@/components/ChatDrawer";
import { UserInfo } from "@/components/UserInfo";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/it", label: "IT Assets" },
  { href: "/dashboard/contracts", label: "Contracts" },
  { href: "/dashboard/hr", label: "HR" },
];


export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const onboarded = user?.unsafeMetadata?.onboarded;
  if (!onboarded) redirect("/onboarding");
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Top nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-white font-semibold tracking-tight">
            Vigil
          </Link>
          <nav className="flex gap-6">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <UserInfo />
      </header>

      {/* Content */}
      <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
        {children}
      </main>

      <Suspense>
        <LoggedToast />
      </Suspense>
      <ChatDrawer />
    </div>
  );
}
