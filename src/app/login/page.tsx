import { signIn, signUp } from "./actions";

export const metadata = { title: "Sign in – Medfellow Finance" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const { error, mode } = await searchParams;
  const isSignUp = mode === "signup";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <form
        action={isSignUp ? signUp : signIn}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Medfellow Finance</h1>
          <p className="text-sm text-zinc-500">
            {isSignUp ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        {isSignUp && (
          <input name="full_name" required placeholder="Full name" className="input" />
        )}
        <input name="email" type="email" required placeholder="Email" className="input" />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8 characters)"
          className="input"
        />
        <button className="btn-primary w-full">{isSignUp ? "Sign up" : "Sign in"}</button>

        <p className="text-center text-xs text-zinc-500">
          {isSignUp ? (
            <>
              Have an account? <a className="underline" href="/login">Sign in</a>
              <br />
              New accounts stay inactive until the Owner approves them. The very first
              account becomes the Owner.
            </>
          ) : (
            <>
              First time? <a className="underline" href="/login?mode=signup">Create account</a>
            </>
          )}
        </p>
      </form>
    </main>
  );
}
