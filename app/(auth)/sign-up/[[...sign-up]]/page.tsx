import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Vigil</h1>
          <p className="text-sm text-zinc-500 mt-1">Asset & contract tracking</p>
        </div>
        <SignUp />
      </div>
    </div>
  );
}
