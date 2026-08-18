import { useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginPlatformAdmin } from "@/lib/api";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const getPlatformRedirectPath = (search = "") => {
  const redirect = new URLSearchParams(search).get("redirect") || "";

  if (!redirect || !redirect.startsWith("/platform/") || redirect.includes("\\")) {
    return "/platform/dashboard";
  }

  return redirect;
};

const PlatformLoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPlatformAuthSession } = usePlatformAuth();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const session = await loginPlatformAdmin(formData);
      setPlatformAuthSession(session);
      navigate(getPlatformRedirectPath(location.search), { replace: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to sign in to the platform portal."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#e0f2fe_48%,#eef2ff_100%)] px-4 py-8 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <img src="/icons/icon-192x192.png?v=20260727-3" alt="" className="h-14 w-14 rounded-2xl shadow-sm" />
              <div>
                <p className="text-3xl font-bold tracking-normal text-slate-950">CureCode</p>
                <p className="text-sm font-semibold text-blue-700">SaaS Platform Administration</p>
              </div>
            </div>
            <h1 className="mt-10 max-w-lg text-4xl font-bold tracking-normal text-slate-950">
              Platform control for CureCode operations.
            </h1>
            <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
              {["Companies", "Subscriptions", "AI Usage", "Storage"].map((item) => (
                <div key={item} className="rounded-xl border border-white/70 bg-white/70 px-4 py-3 shadow-sm">
                  <p className="text-sm font-semibold text-slate-800">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/80 bg-white/92 p-6 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.65)] backdrop-blur-xl">
          <div className="mb-6">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
              Platform Admin
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-normal">Sign in</h2>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Email</span>
              <input
                autoComplete="email"
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                disabled={isSubmitting}
                type="email"
                value={formData.email}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <div className="mt-2 flex h-11 items-center rounded-xl border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                <input
                  autoComplete="current-password"
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                  disabled={isSubmitting}
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, password: event.target.value }))
                  }
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="grid h-10 w-10 place-items-center text-slate-500 transition hover:text-slate-900"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <Button
              className={cn("h-11 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700")}
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
};

export default PlatformLoginPage;
