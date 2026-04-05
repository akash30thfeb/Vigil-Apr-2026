"use client";

import { useUser } from "@clerk/nextjs";
import { UserButton } from "@clerk/nextjs";

export function UserInfo() {
  const { user } = useUser();
  if (!user) return <UserButton />;

  const meta = user.unsafeMetadata as { department?: string; role?: string };
  const firstName = user.firstName ?? user.emailAddresses[0]?.emailAddress.split("@")[0];

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm text-white leading-tight">{firstName}</p>
        {(meta.department || meta.role) && (
          <p className="text-xs text-zinc-500 leading-tight">
            {[meta.role, meta.department].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <UserButton />
    </div>
  );
}
