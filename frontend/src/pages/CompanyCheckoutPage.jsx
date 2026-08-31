import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Building2, LoaderCircle, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import pirnavLogo from "@/assets/pirnav-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  createCashfreeBillingSubscription,
  createCompanyOnboardingAccount,
} from "@/lib/api";
import {
  getCashfreeCheckoutErrorMessage,
  startCashfreeSubscriptionCheckout,
} from "@/services/cashfreeCheckoutService";

const PAID_PLANS = {
  starter: { name: "Starter", monthly: "₹799/month", annual: "₹7,990/year" },
  professional: { name: "Professional", monthly: "₹1,999/month", annual: "₹19,990/year" },
  business: { name: "Business", monthly: "₹3,999/month", annual: "₹39,990/year" },
};

const initialForm = {
  companyName: "",
  companyEmail: "",
  adminName: "",
  adminEmail: "",
  contactPhone: "",
  password: "",
};

export default function CompanyCheckoutPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, setAuthSession } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [accountCreated, setAccountCreated] = useState(false);
  const [error, setError] = useState("");
  const selection = useMemo(() => {
    const query = new URLSearchParams(location.search);
    const planId = String(query.get("plan") || "").toLowerCase();
    const billingCycle = query.get("billingCycle") === "annual" ? "annual" : "monthly";
    return PAID_PLANS[planId] ? { planId, billingCycle, plan: PAID_PLANS[planId] } : null;
  }, [location.search]);

  const checkout = useMutation({
    mutationFn: async () => {
      if (!selection) throw new Error("Please select a paid plan from the pricing page.");
      if (!isAuthenticated && !accountCreated) {
        const session = await createCompanyOnboardingAccount({
          ...form,
          planId: selection.planId,
          billingCycle: selection.billingCycle,
        });
        setAuthSession(session);
        setAccountCreated(true);
      }
      return startCashfreeSubscriptionCheckout({
        planId: selection.planId,
        billingCycle: selection.billingCycle,
        createSubscription: createCashfreeBillingSubscription,
      });
    },
    onSuccess: () => {
      navigate("/settings/billing", { replace: true });
    },
    onError: (checkoutError) => {
      setError(
        checkoutError?.response?.data?.message ||
          (checkoutError?.stage
            ? getCashfreeCheckoutErrorMessage(checkoutError)
            : checkoutError?.message) ||
          "Unable to continue to payment."
      );
    },
  });

  if (!selection) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <p className="font-semibold text-slate-700">Please select a paid CureCode plan.</p>
          <Button asChild className="mt-5"><Link to="/pricing">View pricing</Link></Button>
        </div>
      </main>
    );
  }

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    setError("");
    checkout.mutate();
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,.14),transparent_32%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-4 py-6 text-slate-950 sm:px-6">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link to="/"><img src={pirnavLogo} alt="CureCode" className="h-11 w-auto" /></Link>
        <Link to="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-700">
          <ArrowLeft className="h-4 w-4" /> Pricing
        </Link>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 py-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <aside className="rounded-3xl bg-gradient-to-br from-violet-700 to-indigo-700 p-7 text-white shadow-xl shadow-violet-200">
          <Building2 className="h-8 w-8" />
          <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-violet-200">Selected plan</p>
          <h1 className="mt-2 text-3xl font-black">{selection.plan.name}</h1>
          <p className="mt-2 text-xl font-bold text-white/90">{selection.plan[selection.billingCycle]}</p>
          <div className="mt-7 space-y-3 text-sm text-white/85">
            <p className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0" /> Company workspace with an Admin account</p>
            <p className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0" /> Secure Cashfree subscription checkout</p>
            <p className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0" /> Plan limits synchronized with the platform console</p>
          </div>
        </aside>

        <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8" onSubmit={submit}>
          <h2 className="text-2xl font-black">Company details</h2>
          <p className="mt-2 text-sm text-slate-500">Create your company workspace before continuing to Cashfree.</p>

          {error ? <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

          {!isAuthenticated && !accountCreated ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold"><span>Company Name</span><Input required value={form.companyName} onChange={(event) => updateForm("companyName", event.target.value)} /></label>
              <label className="space-y-1.5 text-sm font-semibold"><span>Company Email</span><Input required type="email" value={form.companyEmail} onChange={(event) => updateForm("companyEmail", event.target.value)} /></label>
              <label className="space-y-1.5 text-sm font-semibold"><span>Administrator Name</span><Input required value={form.adminName} onChange={(event) => updateForm("adminName", event.target.value)} /></label>
              <label className="space-y-1.5 text-sm font-semibold"><span>Administrator Email</span><Input required type="email" value={form.adminEmail} onChange={(event) => updateForm("adminEmail", event.target.value)} /></label>
              <label className="space-y-1.5 text-sm font-semibold"><span>Contact Phone</span><Input required inputMode="tel" placeholder="+91 9876543210" value={form.contactPhone} onChange={(event) => updateForm("contactPhone", event.target.value)} /></label>
              <label className="space-y-1.5 text-sm font-semibold"><span>Admin Password</span><Input required minLength={8} type="password" value={form.password} onChange={(event) => updateForm("password", event.target.value)} /></label>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Company Admin account is ready. Continue to Cashfree payment.</div>
          )}

          <Button className="mt-7 h-12 w-full rounded-xl bg-gradient-to-r from-violet-700 to-indigo-600 text-base font-bold" disabled={checkout.isPending} type="submit">
            {checkout.isPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}
            {checkout.isPending ? "Opening Cashfree..." : accountCreated || isAuthenticated ? "Continue to Cashfree" : "Create Company & Continue"}
          </Button>
          <p className="mt-3 text-center text-xs text-slate-500">Your workspace is created as an Admin account, not a Developer account.</p>
        </form>
      </div>
    </main>
  );
}
