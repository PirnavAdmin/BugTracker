import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Bug,
  CheckCircle2,
  Cloud,
  Code2,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import pirnavLogo from "@/assets/pirnav-logo.png";
import UserAvatar from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  adminLoginRequest,
  loginRequest,
  registerRequest,
  requestPasswordReset,
  resetPassword,
} from "@/lib/api";
import { getDashboardPathByRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

const initialForm = {
  fullName: "",
  email: "",
  password: "",
  role: "Developer",
};

const initialResetForm = {
  email: "",
  otp: "",
  newPassword: "",
  confirmPassword: "",
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordHasLetter = /[A-Za-z]/;
const passwordHasNumber = /\d/;
const ADMIN_ROUTE_PATH = "/admin";
const REMEMBERED_LOGIN_KEY = "curecode_remembered_login";
const isAdminDefaultLoginEnabledOnClient =
  import.meta.env.VITE_ENABLE_ADMIN_DEFAULT_LOGIN !== "false";

const inputClassName =
  "h-11 rounded-2xl border border-[#E5E7EB] bg-white pl-11 pr-4 text-[15px] font-medium text-[#111827] shadow-sm transition duration-200 placeholder:text-[#9CA3AF] hover:border-[#93C5FD] hover:shadow-[0_0_0_4px_rgba(37,99,235,0.06)] focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const passwordInputClassName =
  "h-11 rounded-2xl border border-[#E5E7EB] bg-white pl-11 pr-12 text-[15px] font-medium text-[#111827] shadow-sm transition duration-200 placeholder:text-[#9CA3AF] hover:border-[#93C5FD] hover:shadow-[0_0_0_4px_rgba(37,99,235,0.06)] focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const getSafeRedirectPath = (search = "") => {
  const redirect = new URLSearchParams(search).get("redirect") || "";

  if (
    !redirect ||
    !redirect.startsWith("/") ||
    redirect.startsWith("//") ||
    redirect.includes("\\")
  ) {
    return "";
  }

  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsedUrl = new URL(redirect, origin);

    if (parsedUrl.origin !== origin || ["/login", "/auth", "/admin"].includes(parsedUrl.pathname)) {
      return "";
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch (error) {
    return "";
  }
};

const getAuthErrorMessage = (error) => {
  const message = error?.response?.data?.message;

  if (
    error?.response?.status === 401 ||
    message === "Invalid credentials" ||
    message === "Invalid email or password"
  ) {
    return "Invalid email or password";
  }

  if (error?.response?.status === 409) {
    return message || "An account with that email already exists";
  }

  if (error?.response?.status === 400) {
    return message || "Please review the highlighted fields and try again.";
  }

  if (!error?.response) {
    return "Unable to reach the server. Please check the API and try again.";
  }

  return message || "Authentication failed.";
};

const readRememberedLogin = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(REMEMBERED_LOGIN_KEY);
    const rememberedLogin = rawValue ? JSON.parse(rawValue) : null;

    if (!rememberedLogin?.email || typeof rememberedLogin.password !== "string") {
      return null;
    }

    return {
      email: rememberedLogin.email,
      password: rememberedLogin.password,
      user: rememberedLogin.user || null,
      savedAt: rememberedLogin.savedAt || "",
    };
  } catch (error) {
    window.localStorage.removeItem(REMEMBERED_LOGIN_KEY);
    return null;
  }
};

const writeRememberedLogin = ({ email, password, user }) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    REMEMBERED_LOGIN_KEY,
    JSON.stringify({
      email,
      password,
      user: user
        ? {
            _id: user._id,
            name: user.name,
            email: user.email || email,
            role: user.role,
            avatarUrl: user.avatarUrl,
            profileUrl: user.profileUrl,
            profileImageUrl: user.profileImageUrl,
          }
        : null,
      savedAt: new Date().toISOString(),
    })
  );
};

const clearRememberedLogin = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(REMEMBERED_LOGIN_KEY);
};

const validateForm = ({ mode, formData }) => {
  const errors = {};

  if (mode === "register") {
    if (!formData.fullName.trim()) {
      errors.fullName = "Full name is required";
    } else if (formData.fullName.trim().length < 2) {
      errors.fullName = "Full name must be at least 2 characters long";
    }

  }

  if (!formData.email.trim()) {
    errors.email = "Email is required";
  } else if (!emailRegex.test(formData.email.trim())) {
    errors.email = "Please enter a valid email address";
  }

  if (!formData.password) {
    errors.password = "Password is required";
  } else if (mode === "register" && formData.password.length < 8) {
    errors.password = "Password must be at least 8 characters long";
  } else if (
    mode === "register" &&
    (!passwordHasLetter.test(formData.password) ||
      !passwordHasNumber.test(formData.password))
  ) {
    errors.password = "Password must include at least one letter and one number";
  }

  return errors;
};

const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuthSession } = useAuth();
  const [mode, setMode] = useState("login");
  const [formData, setFormData] = useState(initialForm);
  const [resetForm, setResetForm] = useState(initialResetForm);
  const [resetStep, setResetStep] = useState("request");
  const [fieldErrors, setFieldErrors] = useState({});
  const [resetErrors, setResetErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [rememberedLogin, setRememberedLogin] = useState(() => readRememberedLogin());
  const isAdminRoute = location.pathname === ADMIN_ROUTE_PATH;
  const canUseDefaultPassword =
    mode === "login" &&
    isAdminRoute &&
    isAdminDefaultLoginEnabledOnClient;

  const authMutation = useMutation({
    mutationFn: ({ currentMode, payload }) =>
      currentMode === "admin-default"
        ? adminLoginRequest(payload)
        : currentMode === "login"
          ? loginRequest(payload)
          : registerRequest(payload),
    onSuccess: (data, variables) => {
      if (
        variables.currentMode === "login" ||
        variables.currentMode === "admin-default"
      ) {
        const shouldRemember = Boolean(variables.payload?.rememberMe);
        const rememberedEmail = variables.payload?.email || data?.user?.email || "";
        const rememberedPassword = variables.payload?.password || "";

        if (shouldRemember && rememberedEmail && rememberedPassword) {
          const nextRememberedLogin = {
            email: rememberedEmail,
            password: rememberedPassword,
            user: data?.user || null,
            savedAt: new Date().toISOString(),
          };

          writeRememberedLogin(nextRememberedLogin);
          setRememberedLogin(nextRememberedLogin);
        } else if (!shouldRemember) {
          clearRememberedLogin();
          setRememberedLogin(null);
        }

        setAuthSession(data, {
          rememberMe: shouldRemember,
        });
        navigate(
          getSafeRedirectPath(location.search) ||
            getDashboardPathByRole(data?.user?.role),
          { replace: true }
        );
        return;
      }

      navigate("/login", {
        replace: true,
        state: {
          email: variables.payload.email,
          mode: "login",
          successMessage:
            data?.message || "Account created successfully. Please sign in.",
        },
      });
    },
  });

  useEffect(() => {
    const savedLogin = readRememberedLogin();

    if (!savedLogin) {
      return;
    }

    setRememberedLogin(savedLogin);
    setRememberMe(true);
    setFormData((current) => ({
      ...current,
      email: current.email || savedLogin.email,
      password: current.password || savedLogin.password,
    }));
  }, []);

  const passwordResetRequestMutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: (data) => {
      setResetStep("reset");
      setResetErrors({});
      setSuccessMessage(
        data?.message || "If an account exists for this email, an OTP has been sent."
      );
    },
  });

  const passwordResetMutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: (data) => {
      setMode("login");
      setResetStep("request");
      setShowResetPassword(false);
      setResetErrors({});
      setFormData((current) => ({
        ...current,
        email: resetForm.email,
        password: "",
      }));
      setResetForm(initialResetForm);
      setSuccessMessage(
        data?.message || "Password updated successfully. Please sign in."
      );
    },
  });

  useEffect(() => {
    if (!location.state?.successMessage) {
      return;
    }

    authMutation.reset();
    setFieldErrors({});
    setSuccessMessage(location.state.successMessage);
    setMode("login");
    setShowPassword(false);
    setFormData({
      ...initialForm,
      email: location.state.email || "",
    });
    navigate(location.pathname, { replace: true, state: null });
  }, [authMutation, location.pathname, location.state, navigate]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    authMutation.reset();
    setSuccessMessage("");
    setFieldErrors((current) => {
      if (!current[name]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[name];
      return nextErrors;
    });

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleResetChange = (event) => {
    const { name, value } = event.target;
    passwordResetRequestMutation.reset();
    passwordResetMutation.reset();
    setSuccessMessage("");
    setResetErrors((current) => {
      if (!current[name]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[name];
      return nextErrors;
    });

    setResetForm((current) => ({
      ...current,
      [name]: name === "otp" ? value.replace(/\D/g, "").slice(0, 6) : value,
    }));
  };

  const openForgotPassword = () => {
    authMutation.reset();
    passwordResetRequestMutation.reset();
    passwordResetMutation.reset();
    setMode("forgot");
    setResetStep("request");
    setFieldErrors({});
    setResetErrors({});
    setSuccessMessage("");
    setShowPassword(false);
    setShowResetPassword(false);
    setResetForm({
      ...initialResetForm,
      email: formData.email.trim().toLowerCase(),
    });
  };

  const backToLogin = () => {
    authMutation.reset();
    passwordResetRequestMutation.reset();
    passwordResetMutation.reset();
    setMode("login");
    setResetStep("request");
    setFieldErrors({});
    setResetErrors({});
    setSuccessMessage("");
    setShowResetPassword(false);
  };

  const handleUseDefaultPassword = async () => {
    authMutation.reset();
    setSuccessMessage("");
    setFieldErrors({});

    await authMutation.mutateAsync({
      currentMode: "admin-default",
      payload: {
        rememberMe,
      },
    });
  };

  const handleRememberMeChange = (event) => {
    const isChecked = event.target.checked;

    setRememberMe(isChecked);

    if (!isChecked) {
      clearRememberedLogin();
      setRememberedLogin(null);
      return;
    }

    const savedLogin = readRememberedLogin();
    if (savedLogin) {
      setRememberedLogin(savedLogin);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    authMutation.reset();
    setSuccessMessage("");

    const errors = validateForm({ mode, formData });

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});

    const normalizedEmail = formData.email.trim().toLowerCase();

    const payload =
      mode === "login"
        ? {
            email: normalizedEmail,
            password: formData.password,
            rememberMe,
          }
        : {
            name: formData.fullName.trim(),
            email: normalizedEmail,
            password: formData.password,
            role: formData.role,
          };

    await authMutation.mutateAsync({
      currentMode: mode,
      payload,
    });
  };

  const handlePasswordResetSubmit = async (event) => {
    event.preventDefault();
    passwordResetRequestMutation.reset();
    passwordResetMutation.reset();
    setSuccessMessage("");

    const normalizedEmail = resetForm.email.trim().toLowerCase();
    const errors = {};

    if (!normalizedEmail) {
      errors.email = "Email is required";
    } else if (!emailRegex.test(normalizedEmail)) {
      errors.email = "Please enter a valid email address";
    }

    if (resetStep === "reset") {
      if (!resetForm.otp.trim()) {
        errors.otp = "OTP is required";
      } else if (!/^\d{6}$/.test(resetForm.otp.trim())) {
        errors.otp = "Enter the 6 digit OTP";
      }

      if (!resetForm.newPassword) {
        errors.newPassword = "New password is required";
      } else if (resetForm.newPassword.length < 8) {
        errors.newPassword = "Password must be at least 8 characters long";
      } else if (
        !passwordHasLetter.test(resetForm.newPassword) ||
        !passwordHasNumber.test(resetForm.newPassword)
      ) {
        errors.newPassword = "Password must include at least one letter and one number";
      }

      if (resetForm.confirmPassword !== resetForm.newPassword) {
        errors.confirmPassword = "Passwords do not match";
      }
    }

    if (Object.keys(errors).length) {
      setResetErrors(errors);
      return;
    }

    setResetErrors({});

    if (resetStep === "request") {
      await passwordResetRequestMutation.mutateAsync({
        email: normalizedEmail,
      });
      setResetForm((current) => ({
        ...current,
        email: normalizedEmail,
      }));
      return;
    }

    await passwordResetMutation.mutateAsync({
      email: normalizedEmail,
      otp: resetForm.otp.trim(),
      newPassword: resetForm.newPassword,
    });
  };

  const submitLabel = useMemo(() => {
    if (authMutation.isPending) {
      return mode === "login" ? "Logging in..." : "Creating account...";
    }

    return mode === "login" ? "Login" : "Create account";
  }, [authMutation.isPending, mode]);

  const resetSubmitLabel =
    resetStep === "request"
      ? passwordResetRequestMutation.isPending
        ? "Sending OTP..."
        : "Send OTP"
      : passwordResetMutation.isPending
        ? "Updating password..."
        : "Change password";
  const resetError =
    passwordResetRequestMutation.error || passwordResetMutation.error;
  const isResetPending =
    passwordResetRequestMutation.isPending || passwordResetMutation.isPending;

  const eyebrowCopy = mode === "forgot" ? "Password Help" : "Welcome Back";
  const titleCopy =
    mode === "forgot"
      ? resetStep === "request"
        ? "Reset your password"
        : "Enter OTP and new password"
      : "Sign in to your workspace";

  const premiumTitle =
    mode === "register"
      ? "Create your workspace"
      : titleCopy;
  const premiumEyebrow = mode === "forgot" ? "Password Help" : "Welcome Back";
  const rememberedUser = rememberedLogin?.user || {
    email: rememberedLogin?.email,
    name: rememberedLogin?.email,
  };

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-white text-[#111827]"
      style={{ fontFamily: '"Inter", sans-serif', minHeight: "var(--app-viewport-height)" }}
    >
      <div className="pointer-events-none absolute -left-36 top-12 h-96 w-96 rounded-full bg-[#E0F2FE]/70 blur-3xl" />
      <div className="pointer-events-none absolute right-[-8rem] top-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[#F3E8FF]/70 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-1/3 h-[24rem] w-[24rem] rounded-full bg-[#ECFEFF]/80 blur-3xl" />

      <div className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <section className="relative hidden min-h-screen overflow-hidden px-[clamp(2rem,4vw,4rem)] py-[clamp(1rem,2.2vh,2.25rem)] lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <img src={pirnavLogo} alt="CureCode logo" className="h-[clamp(2.75rem,5.2vh,4rem)] w-auto object-contain" />
          </div>

          <div className="mt-[clamp(1.25rem,3vh,2.5rem)] max-w-[620px]">
            <p className="text-[clamp(0.85rem,1.6vh,1rem)] font-semibold text-[#2563EB]">Where code gets cured.</p>
            <h1
              className="mt-[clamp(0.65rem,1.7vh,1.25rem)] max-w-[600px] text-[clamp(3rem,4.8vw,5.2rem)] font-extrabold leading-[0.95] tracking-normal text-[#111827]"
              style={{ fontFamily: '"Poppins", "Inter", sans-serif' }}
            >
              Code better. Ship faster.
            </h1>
            <p className="mt-[clamp(0.9rem,2vh,1.5rem)] max-w-[540px] text-[clamp(1rem,1.55vw,1.15rem)] font-medium leading-[1.65] text-[#6B7280]">
              CureCode is your intelligent development platform that helps teams build,
              track, collaborate, and deliver bug-free software faster.
            </p>
          </div>

          {mode === "login" && rememberedLogin ? (
            <div className="mt-[clamp(1rem,2.4vh,1.75rem)] flex max-w-[520px] items-center gap-4 rounded-2xl border border-[#E5E7EB] bg-white/90 px-4 py-3 shadow-[0_18px_45px_-28px_rgba(37,99,235,0.55)] backdrop-blur">
              <UserAvatar
                user={rememberedUser}
                className="h-14 w-14 shrink-0 border border-blue-100 shadow-sm"
                fallbackClassName="text-base font-bold"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#2563EB]">Welcome back</p>
                <p className="truncate text-base font-extrabold text-[#111827]">
                  {rememberedUser?.name || rememberedLogin.email}
                </p>
                <p className="truncate text-sm font-medium text-[#6B7280]">
                  Saved password: {"*".repeat(Math.min(rememberedLogin.password.length || 8, 12))}
                </p>
              </div>
            </div>
          ) : null}

          <div className="relative mt-auto h-[clamp(15rem,34vh,26rem)]">
            <div className="absolute left-4 top-16 h-9 w-9 rounded-xl border border-blue-100 bg-white shadow-lg" />
            <div className="absolute right-16 top-7 h-12 w-12 rounded-full border border-cyan-100 bg-cyan-50 shadow-lg" />
            <div className="absolute bottom-16 left-20 h-14 w-14 rotate-12 rounded-2xl border border-purple-100 bg-purple-50 shadow-lg" />

            <div className="absolute left-1/2 top-1/2 aspect-[47/29] w-[clamp(23rem,45vw,29.375rem)] -translate-x-1/2 -translate-y-1/2 rounded-[32px] border border-white bg-[linear-gradient(135deg,#EFF6FF_0%,#FFFFFF_45%,#ECFEFF_100%)] p-[clamp(1rem,1.5vw,1.5rem)] shadow-[0_30px_90px_-35px_rgba(15,23,42,0.45)]">
              <div className="h-full rounded-[24px] border border-[#E5E7EB] bg-[#0F172A] p-[clamp(1rem,1.3vw,1.25rem)] shadow-inner">
                <div className="mb-[clamp(0.75rem,1.4vh,1.25rem)] flex gap-2">
                  <span className="h-3 w-3 rounded-full bg-[#F87171]" />
                  <span className="h-3 w-3 rounded-full bg-[#FBBF24]" />
                  <span className="h-3 w-3 rounded-full bg-[#34D399]" />
                </div>
                <div className="space-y-[clamp(0.35rem,1vh,0.75rem)] font-mono text-[clamp(0.7rem,1.2vw,0.875rem)]">
                  <p className="text-cyan-300">const cure = await CureCode.scan(repo);</p>
                  <p className="text-purple-300">{"deploy.fix({ bugs: cure.resolved });"}</p>
                  <p className="text-blue-300">{"team.ship({ confidence: \"high\" });"}</p>
                  <div className="mt-[clamp(0.75rem,2vh,1.5rem)] grid grid-cols-3 gap-3">
                    <div className="h-[clamp(2.5rem,6vh,4rem)] rounded-2xl bg-cyan-400/15" />
                    <div className="h-[clamp(2.5rem,6vh,4rem)] rounded-2xl bg-blue-400/15" />
                    <div className="h-[clamp(2.5rem,6vh,4rem)] rounded-2xl bg-purple-400/15" />
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute left-[8%] top-[28%] flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_18px_45px_-24px_rgba(37,99,235,0.65)]">
              <Bug className="h-5 w-5 text-[#7C3AED]" />
              <span className="text-sm font-bold text-[#111827]">Bug traced</span>
            </div>
            <div className="absolute right-[9%] top-[24%] rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_18px_45px_-24px_rgba(6,182,212,0.65)]">
              <Cloud className="h-7 w-7 text-[#06B6D4]" />
            </div>
            <div className="absolute bottom-[24%] right-[16%] rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_18px_45px_-24px_rgba(37,99,235,0.65)]">
              <ShieldCheck className="h-7 w-7 text-[#2563EB]" />
            </div>
            <div className="absolute bottom-[18%] left-[16%] rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_18px_45px_-24px_rgba(124,58,237,0.65)]">
              <Bot className="h-7 w-7 text-[#7C3AED]" />
            </div>
            <div className="absolute right-[28%] top-[7%] rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_18px_45px_-24px_rgba(37,99,235,0.55)]">
              <BarChart3 className="h-7 w-7 text-[#2563EB]" />
            </div>
            <div className="absolute bottom-[5%] left-[40%] flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_18px_45px_-24px_rgba(6,182,212,0.55)]">
              <Laptop className="h-5 w-5 text-[#2563EB]" />
              <Code2 className="h-5 w-5 text-[#06B6D4]" />
              <Sparkles className="h-5 w-5 text-[#7C3AED]" />
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-[clamp(1rem,2.4vh,2rem)] sm:px-8 lg:px-10">
          <div className="w-full max-w-[min(500px,92vw)]">
            <div className="mb-8 flex items-center justify-center lg:hidden">
              <img src={pirnavLogo} alt="CureCode logo" className="h-16 w-auto object-contain" />
            </div>

            <div className="max-h-[calc(var(--app-viewport-height)-2rem)] overflow-y-auto rounded-[18px] border border-[#E5E7EB] bg-white p-[clamp(1.25rem,3vh,2rem)] shadow-[0_30px_90px_-48px_rgba(15,23,42,0.45)]">
              <div className="mb-[clamp(1.25rem,2.8vh,2rem)]">
                <p className="text-sm font-bold text-[#2563EB]">{premiumEyebrow}</p>
                <h2 className="mt-2 text-[clamp(2rem,3vw,2.6rem)] font-extrabold leading-[1.1] tracking-normal text-[#111827]">
                  {premiumTitle}
                </h2>
              </div>

              {mode === "forgot" ? (
                <form className="space-y-[clamp(0.85rem,1.7vh,1.25rem)]" onSubmit={handlePasswordResetSubmit}>
                  {successMessage ? (
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{successMessage}</span>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#374151]" htmlFor="reset-email">Email</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9CA3AF]" />
                      <Input
                        aria-invalid={Boolean(resetErrors.email)}
                        autoComplete="email"
                        className={cn(inputClassName, resetErrors.email && "border-rose-300 focus-visible:border-rose-400 focus-visible:ring-rose-500/10")}
                        disabled={isResetPending}
                        id="reset-email"
                        name="email"
                        placeholder="name@company.com"
                        type="email"
                        value={resetForm.email}
                        onChange={handleResetChange}
                      />
                    </div>
                    {resetErrors.email ? <p className="text-sm font-medium text-rose-500">{resetErrors.email}</p> : null}
                  </div>

                  {resetStep === "reset" ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-[#374151]" htmlFor="otp">OTP</label>
                        <div className="relative">
                          <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9CA3AF]" />
                          <Input
                            aria-invalid={Boolean(resetErrors.otp)}
                            autoComplete="one-time-code"
                            className={cn(inputClassName, "tracking-[0.32em]", resetErrors.otp && "border-rose-300 focus-visible:border-rose-400")}
                            disabled={isResetPending}
                            id="otp"
                            inputMode="numeric"
                            name="otp"
                            placeholder="000000"
                            value={resetForm.otp}
                            onChange={handleResetChange}
                          />
                        </div>
                        {resetErrors.otp ? <p className="text-sm font-medium text-rose-500">{resetErrors.otp}</p> : null}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-[#374151]" htmlFor="newPassword">New password</label>
                        <div className="relative">
                          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9CA3AF]" />
                          <Input
                            aria-invalid={Boolean(resetErrors.newPassword)}
                            autoComplete="new-password"
                            className={cn(passwordInputClassName, resetErrors.newPassword && "border-rose-300 focus-visible:border-rose-400")}
                            disabled={isResetPending}
                            id="newPassword"
                            name="newPassword"
                            placeholder="Create a new password"
                            type={showResetPassword ? "text" : "password"}
                            value={resetForm.newPassword}
                            onChange={handleResetChange}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#6B7280] transition hover:bg-[#F8FAFC] hover:text-[#111827]"
                            aria-label={showResetPassword ? "Hide password" : "Show password"}
                            disabled={isResetPending}
                            onClick={() => setShowResetPassword((current) => !current)}
                          >
                            {showResetPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                        {resetErrors.newPassword ? <p className="text-sm font-medium text-rose-500">{resetErrors.newPassword}</p> : null}
                      </div>
                    </>
                  ) : null}

                  {resetError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                      {getAuthErrorMessage(resetError)}
                    </div>
                  ) : null}

                  <Button className="group h-11 w-full rounded-2xl border-0 bg-[linear-gradient(100deg,#2563EB_0%,#06B6D4_100%)] text-base font-bold text-white shadow-[0_18px_42px_-18px_rgba(37,99,235,0.75)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_52px_-18px_rgba(6,182,212,0.75)]" disabled={isResetPending} type="submit">
                    {resetSubmitLabel}
                    {isResetPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />}
                  </Button>

                  <button type="button" className="w-full rounded-xl px-3 py-2 text-sm font-bold text-[#2563EB] transition hover:bg-blue-50" disabled={isResetPending} onClick={backToLogin}>
                    Back to login
                  </button>
                </form>
              ) : (
                <form className="space-y-[clamp(0.85rem,1.7vh,1.25rem)]" onSubmit={handleSubmit}>
                  {successMessage ? (
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{successMessage}</span>
                    </div>
                  ) : null}

                  {mode === "register" ? (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#374151]" htmlFor="fullName">Full name</label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9CA3AF]" />
                        <Input aria-invalid={Boolean(fieldErrors.fullName)} className={cn(inputClassName, fieldErrors.fullName && "border-rose-300 focus-visible:border-rose-400")} disabled={authMutation.isPending} id="fullName" name="fullName" placeholder="Your name" value={formData.fullName} onChange={handleChange} />
                      </div>
                      {fieldErrors.fullName ? <p className="text-sm font-medium text-rose-500">{fieldErrors.fullName}</p> : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#374151]" htmlFor="email">Email</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9CA3AF]" />
                      <Input aria-invalid={Boolean(fieldErrors.email)} autoComplete="email" className={cn(inputClassName, fieldErrors.email && "border-rose-300 focus-visible:border-rose-400")} disabled={authMutation.isPending} id="email" name="email" placeholder="name@company.com" type="email" value={formData.email} onChange={handleChange} />
                    </div>
                    {fieldErrors.email ? <p className="text-sm font-medium text-rose-500">{fieldErrors.email}</p> : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#374151]" htmlFor="password">Password</label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9CA3AF]" />
                      <Input aria-invalid={Boolean(fieldErrors.password)} autoComplete={mode === "login" ? "current-password" : "new-password"} className={cn(passwordInputClassName, fieldErrors.password && "border-rose-300 focus-visible:border-rose-400")} disabled={authMutation.isPending} id="password" name="password" placeholder="Enter your password" type={showPassword ? "text" : "password"} value={formData.password} onChange={handleChange} />
                      <button type="button" className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#6B7280] transition hover:bg-[#F8FAFC] hover:text-[#111827]" aria-label={showPassword ? "Hide password" : "Show password"} disabled={authMutation.isPending} onClick={() => setShowPassword((current) => !current)}>
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {fieldErrors.password ? <p className="text-sm font-medium text-rose-500">{fieldErrors.password}</p> : null}
                  </div>

                  {mode === "login" ? (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <label className="flex min-w-0 cursor-pointer items-center gap-2.5 text-[#374151]">
                        <input checked={rememberMe} className="h-4 w-4 shrink-0 rounded border-[#D1D5DB] text-[#2563EB] focus:ring-2 focus:ring-blue-500/20" disabled={authMutation.isPending} type="checkbox" onChange={handleRememberMeChange} />
                        <span className="truncate font-bold">Remember me</span>
                        <span className="shrink-0 font-medium text-[#6B7280]">30 days</span>
                      </label>
                      <button type="button" className="shrink-0 font-bold text-[#2563EB] transition hover:text-[#06B6D4]" disabled={authMutation.isPending} onClick={openForgotPassword}>
                        Forgot Password
                      </button>
                    </div>
                  ) : null}

                  {canUseDefaultPassword ? (
                    <button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-[#2563EB] transition hover:border-blue-200 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-70" disabled={authMutation.isPending} type="button" onClick={handleUseDefaultPassword}>
                      Use Default Password
                    </button>
                  ) : null}

                  {authMutation.error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                      {getAuthErrorMessage(authMutation.error)}
                    </div>
                  ) : null}

                  <Button className="group h-11 w-full rounded-2xl border-0 bg-[linear-gradient(100deg,#2563EB_0%,#06B6D4_100%)] text-base font-bold text-white shadow-[0_18px_42px_-18px_rgba(37,99,235,0.75)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_52px_-18px_rgba(6,182,212,0.75)]" disabled={authMutation.isPending} type="submit">
                    {submitLabel}
                    {authMutation.isPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />}
                  </Button>

                  {mode === "login" ? (
                    <>
                      <div className="flex items-center gap-4 py-1">
                        <span className="h-px flex-1 bg-[#E5E7EB]" />
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#9CA3AF]">or continue with</span>
                        <span className="h-px flex-1 bg-[#E5E7EB]" />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <button type="button" className="flex h-11 items-center justify-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white text-sm font-bold text-[#374151] shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md">
                          <span className="grid h-5 w-5 place-items-center rounded-full border border-[#E5E7EB] text-sm font-extrabold text-[#2563EB]">
                            G
                          </span>
                          Google
                        </button>
                        <button type="button" className="flex h-11 items-center justify-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white text-sm font-bold text-[#374151] shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md">
                          <span className="grid h-5 w-5 grid-cols-2 gap-0.5">
                            <span className="bg-[#F25022]" />
                            <span className="bg-[#7FBA00]" />
                            <span className="bg-[#00A4EF]" />
                            <span className="bg-[#FFB900]" />
                          </span>
                          Microsoft
                        </button>
                      </div>
                    </>
                  ) : null}

                  <p className="text-center text-sm font-medium text-[#6B7280]">
                    {mode === "login" ? "Don't have an account? " : "Already have an account? "}
                    <button
                      type="button"
                      className="font-extrabold text-[#2563EB] transition hover:text-[#06B6D4]"
                      disabled={authMutation.isPending}
                      onClick={() => {
                        authMutation.reset();
                        setFieldErrors({});
                        setSuccessMessage("");
                        setMode((current) => (current === "login" ? "register" : "login"));
                      }}
                    >
                      {mode === "login" ? "Create Account" : "Sign in"}
                    </button>
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );

  return (
    <main
      className="auth-page-shell relative min-h-screen overflow-hidden bg-[#031A33] text-white"
      style={{ fontFamily: '"Inter", sans-serif' }}
    >
      <div className="auth-illustration-fallback absolute inset-0" aria-hidden="true" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(3,26,51,0.96)_0%,rgba(2,18,37,0.98)_52%,rgba(1,11,24,1)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(14,116,144,0.18)_0%,transparent_34%),radial-gradient(circle_at_48%_88%,rgba(37,99,235,0.16)_0%,transparent_32%)]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-3 py-2 sm:px-5 sm:py-4">
        <div className="auth-fade-in w-full max-w-[430px]">
          <div className="auth-card-shell relative flex w-full flex-col overflow-hidden rounded-[24px] border border-white/18 bg-slate-950/[0.56] p-3 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.86)] backdrop-blur-[26px] sm:rounded-[28px] sm:p-5">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />
            <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="relative flex min-h-0 flex-col">
            <div className="shrink-0 space-y-1 sm:space-y-1.5">
              <div className="flex items-center">
                <img
                  src={pirnavLogo}
                  alt="CureCode logo"
                  className="mb-2 h-14 w-auto object-contain sm:mb-3 sm:h-20 lg:h-24"
                />
              </div>
              <p className="text-[13px] font-medium text-white/72">{eyebrowCopy}</p>
              <h1
                className="auth-title text-[22px] font-semibold leading-[1.1] text-white sm:text-[26px] lg:text-[28px]"
                style={{ fontFamily: '"Poppins", sans-serif' }}
              >
                {titleCopy}
              </h1>
            </div>

            {mode === "forgot" ? (
              <form
                className="auth-card-scroll -mr-2 mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2 sm:mt-4 sm:space-y-3.5"
                onSubmit={handlePasswordResetSubmit}
              >
                {successMessage ? (
                  <div className="flex items-start gap-3 rounded-[10px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <span>{successMessage}</span>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-200" htmlFor="reset-email">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="auth-field-icon pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <Input
                      aria-invalid={Boolean(resetErrors.email)}
                      autoComplete="email"
                      className={cn(
                        inputClassName,
                        resetErrors.email &&
                          "border-rose-400/60 focus-visible:border-rose-400 focus-visible:ring-rose-500/25"
                      )}
                      disabled={isResetPending}
                      id="reset-email"
                      name="email"
                      type="email"
                      placeholder="name@company.com"
                      value={resetForm.email}
                      onChange={handleResetChange}
                    />
                  </div>
                  {resetErrors.email ? (
                    <p className="text-sm text-rose-300">{resetErrors.email}</p>
                  ) : null}
                </div>

                {resetStep === "reset" ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-200" htmlFor="otp">
                        OTP
                      </label>
                      <div className="relative">
                        <KeyRound className="auth-field-icon pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <Input
                          aria-invalid={Boolean(resetErrors.otp)}
                          autoComplete="one-time-code"
                          className={cn(
                            inputClassName,
                            "tracking-[0.32em]",
                            resetErrors.otp &&
                              "border-rose-400/60 focus-visible:border-rose-400 focus-visible:ring-rose-500/25"
                          )}
                          disabled={isResetPending}
                          id="otp"
                          inputMode="numeric"
                          name="otp"
                          placeholder="000000"
                          value={resetForm.otp}
                          onChange={handleResetChange}
                        />
                      </div>
                      {resetErrors.otp ? (
                        <p className="text-sm text-rose-300">{resetErrors.otp}</p>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-200" htmlFor="newPassword">
                        New password
                      </label>
                      <div className="relative">
                        <LockKeyhole className="auth-field-icon pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <Input
                          aria-invalid={Boolean(resetErrors.newPassword)}
                          autoComplete="new-password"
                          className={cn(
                            passwordInputClassName,
                            resetErrors.newPassword &&
                              "border-rose-400/60 focus-visible:border-rose-400 focus-visible:ring-rose-500/25"
                          )}
                          disabled={isResetPending}
                          id="newPassword"
                          name="newPassword"
                          type={showResetPassword ? "text" : "password"}
                          placeholder="Create a new password"
                          value={resetForm.newPassword}
                          onChange={handleResetChange}
                        />
                        <button
                          type="button"
                          className="auth-field-action absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full"
                          aria-label={showResetPassword ? "Hide password" : "Show password"}
                          disabled={isResetPending}
                          onClick={() => setShowResetPassword((current) => !current)}
                        >
                          {showResetPassword ? (
                            <EyeOff className="h-4 w-4" strokeWidth={2} />
                          ) : (
                            <Eye className="h-4 w-4" strokeWidth={2} />
                          )}
                        </button>
                      </div>
                      {resetErrors.newPassword ? (
                        <p className="text-sm text-rose-300">{resetErrors.newPassword}</p>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-200" htmlFor="confirmPassword">
                        Confirm password
                      </label>
                      <div className="relative">
                        <LockKeyhole className="auth-field-icon pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <Input
                          aria-invalid={Boolean(resetErrors.confirmPassword)}
                          autoComplete="new-password"
                          className={cn(
                            passwordInputClassName,
                            resetErrors.confirmPassword &&
                              "border-rose-400/60 focus-visible:border-rose-400 focus-visible:ring-rose-500/25"
                          )}
                          disabled={isResetPending}
                          id="confirmPassword"
                          name="confirmPassword"
                          type={showResetPassword ? "text" : "password"}
                          placeholder="Confirm new password"
                          value={resetForm.confirmPassword}
                          onChange={handleResetChange}
                        />
                      </div>
                      {resetErrors.confirmPassword ? (
                        <p className="text-sm text-rose-300">{resetErrors.confirmPassword}</p>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {resetError ? (
                  <div className="rounded-[10px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {getAuthErrorMessage(resetError)}
                  </div>
                ) : null}

                <Button
                  className="group mt-2 h-11 w-full rounded-xl border border-cyan-200/24 bg-[linear-gradient(100deg,#2563EB_0%,#0891B2_52%,#F97316_150%)] text-sm font-bold text-white shadow-[0_20px_45px_-16px_rgba(14,165,233,0.68)] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.01] hover:border-cyan-100/36 hover:shadow-[0_26px_58px_-14px_rgba(14,165,233,0.78)] active:translate-y-0 active:scale-[0.99]"
                  disabled={isResetPending}
                  type="submit"
                >
                  {resetSubmitLabel}
                  {isResetPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  )}
                </Button>

                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-sky-200 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-70"
                  disabled={isResetPending}
                  onClick={backToLogin}
                >
                  Back to login
                </button>
              </form>
            ) : (
              <form
                className="auth-card-scroll -mr-2 mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2 sm:mt-4 sm:space-y-3.5"
                onSubmit={handleSubmit}
              >
                {successMessage ? (
                  <div className="flex items-start gap-3 rounded-[10px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <span>{successMessage}</span>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-200" htmlFor="email">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="auth-field-icon pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <Input
                      aria-invalid={Boolean(fieldErrors.email)}
                      autoComplete="email"
                      className={cn(
                        inputClassName,
                        fieldErrors.email &&
                          "border-rose-400/60 focus-visible:border-rose-400 focus-visible:ring-rose-500/25"
                      )}
                      disabled={authMutation.isPending}
                      id="email"
                      name="email"
                      type="email"
                      placeholder="name@company.com"
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </div>
                  {fieldErrors.email ? (
                    <p className="text-sm text-rose-300">{fieldErrors.email}</p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-200" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole className="auth-field-icon pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <Input
                      aria-invalid={Boolean(fieldErrors.password)}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      className={cn(
                        passwordInputClassName,
                        fieldErrors.password &&
                          "border-rose-400/60 focus-visible:border-rose-400 focus-visible:ring-rose-500/25"
                      )}
                      disabled={authMutation.isPending}
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      className="auth-field-action absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      disabled={authMutation.isPending}
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" strokeWidth={2} />
                      ) : (
                        <Eye className="h-4 w-4" strokeWidth={2} />
                      )}
                    </button>
                  </div>
                  {fieldErrors.password ? (
                    <p className="text-sm text-rose-300">{fieldErrors.password}</p>
                  ) : null}
                </div>

                {mode === "login" ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[13px] text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08]">
                    <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
                      <input
                        checked={rememberMe}
                        className="h-4 w-4 shrink-0 rounded border-white/30 bg-slate-950 text-sky-500 focus:ring-2 focus:ring-sky-400/30"
                        disabled={authMutation.isPending}
                        type="checkbox"
                        onChange={(event) => setRememberMe(event.target.checked)}
                      />
                      <span className="truncate font-medium">Remember me</span>
                      <span className="shrink-0 text-[12px] text-slate-300">30 days</span>
                    </label>
                    <button
                      type="button"
                      className="shrink-0 text-right text-[13px] font-semibold text-sky-200 transition hover:text-white disabled:opacity-70"
                      disabled={authMutation.isPending}
                      onClick={openForgotPassword}
                    >
                      Forgot password?
                    </button>
                  </div>
                ) : null}

                {canUseDefaultPassword ? (
                  <button
                    className="mt-3 w-fit rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-left text-[13px] text-[#93C5FD] transition-all duration-200 hover:border-[#3B82F6]/40 hover:bg-[#3B82F6]/20 disabled:cursor-wait disabled:opacity-70"
                    disabled={authMutation.isPending}
                    type="button"
                    onClick={handleUseDefaultPassword}
                  >
                    Use Default Password
                  </button>
                ) : null}

                {authMutation.error ? (
                  <div className="rounded-[10px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {getAuthErrorMessage(authMutation.error)}
                  </div>
                ) : null}

                <Button
                  className="group mt-2 h-11 w-full rounded-xl border border-cyan-200/24 bg-[linear-gradient(100deg,#2563EB_0%,#0891B2_52%,#F97316_150%)] text-sm font-bold text-white shadow-[0_20px_45px_-16px_rgba(14,165,233,0.68)] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.01] hover:border-cyan-100/36 hover:shadow-[0_26px_58px_-14px_rgba(14,165,233,0.78)] active:translate-y-0 active:scale-[0.99]"
                  disabled={authMutation.isPending}
                  type="submit"
                >
                  {submitLabel}
                  {authMutation.isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  )}
                </Button>
              </form>
            )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default AuthPage;
