import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import pirnavLogo from "@/assets/pirnav-logo.png";
import { loginRequest, registerRequest, requestPasswordReset, resetPassword } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { getDashboardPathByRole } from "@/lib/roles";
import { getEmailValidationError } from "@/lib/emailValidation";
import {
  clearRememberedLogin,
  readRememberedLogin,
  writeRememberedLogin,
} from "@/lib/session";
import {
  getPasswordStrength,
  getPasswordValidationError,
} from "@/lib/passwordValidation";

const emailValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const safeRedirect = (search) => {
  const value = new URLSearchParams(search).get("redirect") || "";
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "";
};

const Error = ({ error }) =>
  error ? (
    <p className="rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">
      {error?.response?.data?.message || "Something went wrong. Please try again."}
    </p>
  ) : null;

const InactivityNotice = () => (
  <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] font-semibold text-amber-900">
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200/80 text-xs font-black text-amber-800">
      !
    </span>
    <span>Session Expired</span>
  </div>
);

export default function LoginPage({ signup = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isInactiveLogout = new URLSearchParams(location.search).get("reason") === "inactivity";
  const { setAuthSession } = useAuth();
  const selectedPlan = (() => {
    const params = new URLSearchParams(location.search);
    const planId = params.get("plan");
    const billingCycle = params.get("billingCycle");
    return ["free", "starter", "professional", "business"].includes(planId) &&
      ["monthly", "annual"].includes(billingCycle)
      ? { planId, billingCycle }
      : null;
  })();
  const [mode, setMode] = useState(signup ? "signup" : "login");
  const [savedLogin] = useState(() => readRememberedLogin());
  const [remember, setRemember] = useState(() => Boolean(savedLogin?.email));
  const [form, setForm] = useState(() => ({
    name: "",
    email: savedLogin?.email || "",
    password: savedLogin?.password || "",
  }));
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const resetPasswordValidationError = getPasswordValidationError(newPassword);
  const resetConfirmPasswordError = !confirmPassword
    ? "Confirm your password"
    : confirmPassword !== newPassword
      ? "Confirm password must match new password"
      : "";
  const resetPasswordStrength = getPasswordStrength(newPassword);
  const isResetPasswordFormValid =
    /^\d{6}$/.test(otp) &&
    Boolean(confirmPassword) &&
    !resetPasswordValidationError &&
    !resetConfirmPasswordError;

  const auth = useMutation({
    mutationFn: () =>
      mode === "login"
        ? loginRequest({
            email: form.email.trim().toLowerCase(),
            password: form.password,
            rememberMe: remember,
          })
        : registerRequest({
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            password: form.password,
            role: "Developer",
          }),
    onSuccess: (data) => {
      if (mode === "signup") {
        setMode("login");
        return;
      }
      if (remember && form.email) {
        writeRememberedLogin({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          user: data?.user || null,
        });
      } else if (!remember) {
        clearRememberedLogin();
      }
      setAuthSession(data, { rememberMe: remember });
      const billingTarget =
        selectedPlan?.planId !== "free" && selectedPlan
          ? `/settings/billing?plan=${selectedPlan.planId}&billingCycle=${selectedPlan.billingCycle}`
          : getDashboardPathByRole(data?.user?.role);
      navigate(safeRedirect(location.search) || billingTarget, { replace: true });
    },
  });
  const requestReset = useMutation({
    mutationFn: () => requestPasswordReset({ email: form.email.trim().toLowerCase() }),
    onSuccess: () => setSent(true),
  });
  const reset = useMutation({
    mutationFn: () => resetPassword({ email: form.email.trim().toLowerCase(), otp, newPassword }),
    onSuccess: () => {
      setForgot(false);
      setSent(false);
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setShowResetPassword(false);
      setShowResetConfirmPassword(false);
      setSuccessMessage("Password updated successfully. Please sign in.");
    },
  });
  const submit = (event) => {
    event.preventDefault();
    if (mode === "signup") {
      const validationError = getEmailValidationError(form.email);
      if (validationError) {
        setEmailError(validationError);
        return;
      }
    } else if (!emailValid(form.email)) {
      return;
    }
    setEmailError("");
    if (form.password && (mode !== "signup" || form.name.trim().length >= 2)) auth.mutate();
  };
  const field =
    "h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-100";

  return (
    <main data-theme="light" data-theme-lock="light" className="auth-theme-lock min-h-screen bg-[radial-gradient(circle_at_15%_20%,rgba(124,58,237,.12),transparent_30%),radial-gradient(circle_at_85%_80%,rgba(37,99,235,.1),transparent_30%),#f8fafc] px-5 py-3 text-slate-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link to="/">
          <img className="h-auto w-[210px] max-w-full" src={pirnavLogo} alt="CureCode" />
        </Link>
      </header>
      <div className="mx-auto grid max-w-5xl items-center gap-10 py-6 lg:grid-cols-[1fr_430px] lg:py-4">
        <section className="hidden lg:block">
          <p className="text-sm font-bold uppercase tracking-widest text-violet-700">
            CureCode workspace
          </p>
          <h1 className="mt-4 text-5xl font-black leading-tight">
            Work with clarity.{" "}
            <span className="text-violet-700">Deliver with confidence.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-slate-600">
            A focused workspace for development, QA, project management and collaboration.
          </p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 sm:p-8">
          <h2 className="text-2xl font-black">
            {forgot
              ? sent
                ? "Set a new password"
                : "Reset your password"
              : mode === "signup"
                ? "Create your workspace"
                : "Welcome back"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {forgot
              ? "Use your workspace email to securely reset access."
              : mode === "signup"
                ? "Start with a CureCode workspace for your team."
                : "Sign in to your CureCode workspace"}
          </p>
          {isInactiveLogout && <InactivityNotice />}
          {!forgot && successMessage ? (
            <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
              {successMessage}
            </p>
          ) : null}
          {forgot ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (sent) {
                  if (isResetPasswordFormValid) reset.mutate();
                  return;
                }
                requestReset.mutate();
              }}
              className="mt-7 space-y-4"
            >
              <label className="block text-sm font-bold">
                Email
                <input
                  className={field + " mt-1.5"}
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
                />
              </label>
              {sent && (
                <>
                  <label className="block text-sm font-bold">
                    One-time password
                    <input
                      className={field + " mt-1.5"}
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    New password
                    <div className="relative mt-1.5">
                      <input
                        aria-invalid={Boolean(resetPasswordValidationError)}
                        className={field + " pr-12"}
                        type={showResetPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        required
                      />
                      <button
                        type="button"
                        aria-label={showResetPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-3 text-slate-500"
                        onClick={() => setShowResetPassword((current) => !current)}
                      >
                        {showResetPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                      </button>
                    </div>
                  </label>
                  {resetPasswordValidationError ? (
                    <p role="alert" className="text-sm font-semibold text-rose-600">
                      {resetPasswordValidationError}
                    </p>
                  ) : null}
                  {newPassword ? (
                    <div className="flex items-center gap-3" aria-live="polite">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={
                            "h-full rounded-full transition-all duration-300 " +
                            (resetPasswordStrength.tone === "rose"
                              ? "bg-rose-500"
                              : resetPasswordStrength.tone === "amber"
                                ? "bg-amber-400"
                                : "bg-emerald-500")
                          }
                          style={{ width: `${resetPasswordStrength.width}%` }}
                        />
                      </div>
                      <span className="min-w-[56px] text-right text-xs font-semibold">
                        {resetPasswordStrength.label}
                      </span>
                    </div>
                  ) : null}
                  <label className="block text-sm font-bold">
                    Confirm password
                    <div className="relative mt-1.5">
                      <input
                        aria-invalid={Boolean(resetConfirmPasswordError)}
                        className={field + " pr-12"}
                        type={showResetConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                      />
                      <button
                        type="button"
                        aria-label={showResetConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        className="absolute right-3 top-3 text-slate-500"
                        onClick={() => setShowResetConfirmPassword((current) => !current)}
                      >
                        {showResetConfirmPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                      </button>
                    </div>
                  </label>
                  {resetConfirmPasswordError ? (
                    <p role="alert" className="text-sm font-semibold text-rose-600">
                      {resetConfirmPasswordError}
                    </p>
                  ) : null}
                </>
              )}
              <Error error={requestReset.error || reset.error} />
              <button
                className="h-12 w-full rounded-lg bg-gradient-to-r from-violet-700 to-blue-600 font-bold text-white"
                disabled={
                  requestReset.isPending ||
                  reset.isPending ||
                  (sent && !isResetPasswordFormValid)
                }
              >
                {sent ? "Update password" : "Send OTP"}
              </button>
              <button
                type="button"
                className="w-full text-sm font-bold text-violet-700"
                onClick={() => {
                  setForgot(false);
                  setShowResetPassword(false);
                  setShowResetConfirmPassword(false);
                }}
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={submit} className="mt-7 space-y-4">
              {mode === "signup" && (
                <label className="block text-sm font-bold">
                  Admin name
                  <input
                    className={field + " mt-1.5"}
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    required
                    minLength="2"
                  />
                </label>
              )}
              <label className="block text-sm font-bold">
                Email
                <div className="relative mt-1.5">
                  {mode === "login" ? (
                    <Mail
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600"
                    />
                  ) : null}
                  <input
                    className={field + (mode === "login" ? " pl-11" : "")}
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? "registration-email-error" : undefined}
                    type="email"
                    value={form.email}
                    onInvalid={(event) => {
                      if (mode !== "signup") return;
                      event.preventDefault();
                      setEmailError(getEmailValidationError(event.currentTarget.value));
                    }}
                    onChange={(event) => {
                      auth.reset();
                      setEmailError("");
                      setForm({ ...form, email: event.target.value });
                    }}
                    required
                  />
                </div>
                {emailError && (
                  <span id="registration-email-error" role="alert" className="mt-1 block text-sm font-semibold text-rose-600">
                    {emailError}
                  </span>
                )}
              </label>
              <label className="block text-sm font-bold">
                Password
                <div className="relative mt-1.5">
                  {mode === "login" ? (
                    <LockKeyhole
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600"
                    />
                  ) : null}
                  <input
                    className={field + (mode === "login" ? " pl-11" : "") + " pr-12"}
                    type={show ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    required
                  />
                  <button
                    type="button"
                    aria-label="Toggle password"
                    className="absolute right-3 top-3 text-slate-500"
                    onClick={() => setShow(!show)}
                  >
                    {show ? <Eye size={20} /> : <EyeOff size={20} />}
                  </button>
                </div>
              </label>
              {mode === "login" && (
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(event) => {
                        const isChecked = event.target.checked;
                        setRemember(isChecked);
                        if (!isChecked) {
                          clearRememberedLogin();
                        }
                      }}
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    className="font-bold text-violet-700"
                    onClick={() => {
                      setForgot(true);
                      setShowResetPassword(false);
                      setShowResetConfirmPassword(false);
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              <Error error={auth.error} />
              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-700 to-blue-600 font-bold text-white shadow-lg shadow-violet-200"
                disabled={auth.isPending}
              >
                {auth.isPending ? "Please wait..." : mode === "signup" ? "Create account" : "Sign In"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          <p className="mt-6 text-center text-sm text-slate-600">
            {mode === "login"
              ? "Don't have a CureCode workspace? "
              : "Already have a workspace? "}
            <button
              className="font-bold text-violet-700"
              onClick={() => {
                auth.reset();
                setEmailError("");
                setMode(mode === "login" ? "signup" : "login");
              }}
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </p>
        </section>
      </div>
    </main>
  );
}
