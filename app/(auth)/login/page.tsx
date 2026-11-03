import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-black text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter your credentials to access the control centre.
      </p>
      {params.reason === "account_disabled" && (
        <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          Your account is no longer active. Contact your administrator.
        </div>
      )}
      <div className="mt-6">
        <LoginForm next={params.next ?? ""} />
      </div>
    </div>
  );
}
