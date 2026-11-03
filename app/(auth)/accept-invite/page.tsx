import { AcceptInviteForm } from "./AcceptInviteForm";

export default function AcceptInvitePage() {
  return (
    <div>
      <h1 className="text-2xl font-black text-slate-900">Welcome</h1>
      <p className="mt-1 text-sm text-slate-500">
        Set a password to activate your account. You'll use this to sign in from now on.
      </p>
      <div className="mt-6">
        <AcceptInviteForm />
      </div>
    </div>
  );
}
