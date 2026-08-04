import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Bug,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageSquare,
  Phone,
  Shield,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Video,
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

const fieldClassName =
  "h-12 rounded-[10px] border border-[#DFE4F2] bg-white pl-11 pr-4 text-[15px] font-semibold text-[#080B2F] shadow-[0_8px_22px_-18px_rgba(8,11,47,0.38)] transition placeholder:text-[#8B94B8] hover:border-[#B7C3E8] focus-visible:border-[#6D28D9] focus-visible:ring-4 focus-visible:ring-violet-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const passwordFieldClassName =
  "h-12 rounded-[10px] border border-[#DFE4F2] bg-white pl-11 pr-12 text-[15px] font-semibold text-[#080B2F] shadow-[0_8px_22px_-18px_rgba(8,11,47,0.38)] transition placeholder:text-[#8B94B8] hover:border-[#B7C3E8] focus-visible:border-[#6D28D9] focus-visible:ring-4 focus-visible:ring-violet-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const features = [
  { title: "Bug Tracking", text: "Track issues and resolve faster", icon: Bug, tone: "violet" },
  { title: "Agile Boards", text: "Plan sprints and deliver on time", icon: CalendarDays, tone: "green" },
  { title: "Team Meetings", text: "Connect, discuss and decide", icon: Users, tone: "orange" },
  { title: "Chat & Collab", text: "Real-time team communication", icon: MessageSquare, tone: "blue" },
  { title: "Reports & Analytics", text: "Insightful reports and dashboards", icon: BarChart3, tone: "indigo" },
  { title: "Secure Release", text: "Ship reviewed fixes with confidence", icon: ShieldCheck, tone: "rose" },
];

const pricingPlans = [
  {
    name: "Starter",
    tagline: "Perfect for small teams",
    price: "0",
    suffix: "forever",
    action: "Get Started",
    features: ["Up to 5 Users", "2 Projects", "200 Issues", "1 GB Storage", "Basic Reports", "Community Support"],
  },
  {
    name: "Growth",
    tagline: "Best for growing teams",
    oldPrice: "499",
    discount: "40% OFF",
    price: "299",
    suffix: "/user/month",
    action: "Start Free Trial",
    features: ["Up to 25 Users", "Unlimited Projects", "10,000 Issues", "20 GB Storage", "Advanced Reports", "Email Support"],
  },
  {
    name: "Business",
    tagline: "For productive teams",
    oldPrice: "999",
    discount: "40% OFF",
    price: "599",
    suffix: "/user/month",
    action: "Start Free Trial",
    popular: true,
    features: ["Unlimited Users", "Unlimited Projects", "Unlimited Issues", "100 GB Storage", "Meeting Recording", "Custom Workflows", "SLA & Priorities"],
  },
  {
    name: "Enterprise",
    tagline: "For large organizations",
    oldPrice: "1999",
    discount: "25% OFF",
    price: "1499",
    suffix: "/user/month",
    action: "Contact Sales",
    features: ["Everything in Business", "SSO & SCIM", "Dedicated Support", "On-premise Option", "Custom Integrations", "Advanced Security"],
  },
];

const addOns = [
  { title: "Extra Storage", text: "Starts at Rs49/month", icon: Shield },
  { title: "Meeting Recording", text: "Rs199/month", icon: Video },
  { title: "Advanced Analytics", text: "Rs149/month", icon: BarChart3 },
  { title: "Priority Support", text: "Rs249/month", icon: Phone },
];

const trustBadges = [
  ["14-Day Free Trial", "No credit card required", ShieldCheck],
  ["Cancel Anytime", "No questions asked", Shield],
  ["99.9% Uptime", "Guaranteed", CheckCircle2],
  ["Secure & Reliable", "Enterprise-grade security", LockKeyhole],
  ["GDPR Compliant", "Your data is safe", ShieldCheck],
];

const navItems = [
  { label: "Features", sectionId: "features", hasMenu: true },
  { label: "Pricing", sectionId: "pricing" },
  { label: "Resources", sectionId: "resources", hasMenu: true },
  { label: "Enterprise", sectionId: "enterprise" },
  { label: "Contact Sales", sectionId: "contact" },
];

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

const getFeatureTone = (tone) =>
  ({
    violet: "bg-violet-50 text-violet-600",
    green: "bg-emerald-50 text-emerald-600",
    orange: "bg-orange-50 text-orange-500",
    blue: "bg-blue-50 text-blue-600",
    indigo: "bg-indigo-50 text-indigo-600",
    rose: "bg-rose-50 text-rose-500",
  })[tone] || "bg-blue-50 text-blue-600";

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
  const [activeSection, setActiveSection] = useState("features");
  const [registerStep, setRegisterStep] = useState("profile");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const marketingScrollerRef = useRef(null);
  const isAdminRoute = location.pathname === ADMIN_ROUTE_PATH;
  const canUseDefaultPassword =
    mode === "login" &&
    isAdminRoute &&
    isAdminDefaultLoginEnabledOnClient;
  const sectionOrder = useMemo(
    () => ["features", "pricing", "resources", "enterprise", "contact"],
    []
  );

  const scrollToSection = (sectionId, options = {}) => {
    if (!sectionOrder.includes(sectionId)) {
      return;
    }

    setActiveSection(sectionId);

    if (options.updateHash !== false) {
      navigate(`${location.pathname}#${sectionId}`, { replace: true });
    }
  };

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

  useEffect(() => {
    const hashSection = location.hash.replace("#", "");

    if (!hashSection || !sectionOrder.includes(hashSection)) {
      return;
    }

    setActiveSection(hashSection);
  }, [location.hash, sectionOrder]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      const scrollerNode = marketingScrollerRef.current;

      if (!scrollerNode || scrollerNode.matches(":hover")) {
        return;
      }

      const currentIndex = Math.max(sectionOrder.indexOf(activeSection), 0);
      const nextSection = sectionOrder[(currentIndex + 1) % sectionOrder.length];

      setActiveSection(nextSection);
    }, 7000);

    return () => window.clearInterval(timerId);
  }, [activeSection, sectionOrder]);

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

  const switchAuthMode = () => {
    authMutation.reset();
    setFieldErrors({});
    setSuccessMessage("");
    setShowPassword(false);
    setRegisterStep("profile");
    setMode((current) => (current === "login" ? "register" : "login"));
  };

  const openRegister = () => {
    authMutation.reset();
    setFieldErrors({});
    setSuccessMessage("");
    setShowPassword(false);
    setRegisterStep("profile");
    setMode("register");
  };

  const continueRegisterProfile = () => {
    authMutation.reset();
    setSuccessMessage("");

    const errors = {};

    if (!formData.fullName.trim()) {
      errors.fullName = "Full name is required";
    } else if (formData.fullName.trim().length < 2) {
      errors.fullName = "Full name must be at least 2 characters long";
    }

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = "Please enter a valid email address";
    }

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setRegisterStep("security");
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

  const authEyebrow = mode === "forgot" ? "Password Help" : mode === "register" ? "Start free" : "Welcome back";
  const authTitle =
    mode === "forgot"
      ? resetStep === "request"
        ? "Reset your password"
        : "Enter OTP and new password"
      : mode === "register"
        ? "Create your workspace"
        : "Sign in to your workspace";
  const authSubtitle =
    mode === "forgot"
      ? "We will send a secure OTP to your email."
      : mode === "register"
        ? "Start planning, tracking, and shipping with CureCode."
        : "Continue to your CureCode workspace";
  const rememberedUser = rememberedLogin?.user || {
    email: rememberedLogin?.email,
    name: rememberedLogin?.email,
  };
  const getDisplayedPlanPrice = (plan) => {
    const basePrice = Number(plan.price) || 0;

    if (billingCycle === "monthly" || basePrice === 0) {
      return {
        oldPrice: plan.oldPrice,
        price: plan.price,
        suffix: plan.suffix,
        helper: basePrice === 0 ? "Free forever" : "Billed monthly",
      };
    }

    return {
      oldPrice: plan.oldPrice ? String(Number(plan.oldPrice) * 12) : "",
      price: String(Math.round(basePrice * 12 * 0.8)),
      suffix: plan.suffix === "forever" ? "forever" : "/user/year",
      helper: "Billed annually",
    };
  };

  return (
    <main
      className="min-h-[var(--app-viewport-height)] overflow-y-auto bg-[#FBFCFF] text-[#080B2F] xl:h-[var(--app-viewport-height)] xl:overflow-hidden"
      style={{ fontFamily: '"Inter", sans-serif' }}
    >
      <div className="mx-auto grid min-h-full max-w-[1920px] grid-cols-1 xl:h-full xl:grid-cols-[minmax(0,1.86fr)_minmax(480px,0.98fr)]">
        <section
          ref={marketingScrollerRef}
          className="relative overflow-visible border-r border-[#E7EBF7] px-5 py-6 sm:px-8 lg:px-10 xl:h-full xl:overflow-hidden xl:px-12"
        >
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_14%,rgba(37,99,235,0.08),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(124,58,237,0.08),transparent_24%),linear-gradient(135deg,#FFFFFF_0%,#F7FAFF_54%,#FBF8FF_100%)]" />

          <header className="flex flex-wrap items-center justify-between gap-5 py-2">
            <img src={pirnavLogo} alt="CureCode" className="h-10 w-auto object-contain sm:h-11" />
            <nav className="hidden items-center gap-8 text-[13px] font-extrabold text-[#080B2F] lg:flex xl:gap-10">
              {navItems.map((item) => {
                const isActive = activeSection === item.sectionId;

                return (
                  <button
                    key={item.sectionId}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-full px-3 transition",
                      isActive
                        ? "bg-[#F2EAFE] text-[#6D28D9]"
                        : "text-[#080B2F] hover:bg-[#F7F4FF] hover:text-[#6D28D9]"
                    )}
                    type="button"
                    onClick={() => scrollToSection(item.sectionId)}
                  >
                    {item.label}
                    {item.hasMenu ? <ChevronDown className="h-3.5 w-3.5" /> : null}
                  </button>
                );
              })}
            </nav>
          </header>

          <div className="flex h-[calc(100%-4rem)] min-h-0 flex-col justify-center overflow-hidden">
            {activeSection === "features" ? (
              <section className="animate-in fade-in duration-300">
                <div className="max-w-[760px]">
                  <h1
                    className="text-[clamp(3.5rem,6vw,7rem)] font-extrabold leading-[0.98] tracking-normal text-[#080B2F]"
                    style={{ fontFamily: '"Poppins", "Inter", sans-serif' }}
                  >
                    Code better.
                    <br />
                    Ship <span className="bg-[linear-gradient(100deg,#0A6BFF,#8A2BFF)] bg-clip-text text-transparent">faster.</span>
                  </h1>
                  <p className="mt-7 max-w-[660px] text-[clamp(1rem,1.35vw,1.25rem)] font-semibold leading-8 text-[#55618A]">
                    CureCode is the all-in-one engineering collaboration platform to
                    plan, build, track and deliver bug-free software.
                  </p>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
                  {features.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.title} className="min-h-[150px] rounded-[10px] border border-white bg-white/88 p-4 shadow-[0_16px_44px_-32px_rgba(8,11,47,0.42)]">
                        <div className={cn("mb-3 grid h-10 w-10 place-items-center rounded-[9px]", getFeatureTone(feature.tone))}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="text-sm font-extrabold text-[#080B2F]">{feature.title}</h3>
                        <p className="mt-2 text-xs font-semibold leading-5 text-[#667196]">{feature.text}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {activeSection === "pricing" ? (
              <section className="animate-in fade-in duration-300">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-[clamp(1.5rem,2.1vw,2.35rem)] font-extrabold text-[#080B2F]">
                    Simple, flexible pricing for teams of all sizes
                  </h2>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="inline-flex items-center rounded-full border border-[#D9DEF2] bg-white p-1 text-sm font-extrabold shadow-sm">
                      {["monthly", "annual"].map((cycle) => (
                        <button
                          key={cycle}
                          className={cn(
                            "rounded-full px-5 py-2 capitalize transition",
                            billingCycle === cycle ? "bg-[#F4F0FF] text-[#080B2F]" : "text-[#667196] hover:text-[#6D28D9]"
                          )}
                          type="button"
                          onClick={() => setBillingCycle(cycle)}
                        >
                          {cycle === "annual" ? "Annual" : "Monthly"}
                        </button>
                      ))}
                      <span className="rounded-full bg-emerald-50 px-4 py-2 text-emerald-600">Save up to 20%</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-[#455079]">
                      All prices in INR <Info className="h-4 w-4" />
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-4 gap-4">
                  {pricingPlans.map((plan) => {
                    const displayPlan = getDisplayedPlanPrice(plan);

                    return (
                      <article
                        key={plan.name}
                        className={cn(
                          "relative flex min-h-[360px] flex-col rounded-[10px] border bg-white p-5 shadow-[0_18px_50px_-36px_rgba(8,11,47,0.4)]",
                          plan.popular ? "border-[#8A2BFF] ring-1 ring-[#8A2BFF]" : "border-[#DDE3F2]"
                        )}
                      >
                        {plan.popular ? (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-t-[8px] bg-[linear-gradient(100deg,#7C2DFF,#A433FF)] px-6 py-1.5 text-xs font-extrabold uppercase text-white">
                            Most Popular
                          </div>
                        ) : null}
                        <h3 className="text-lg font-extrabold text-[#080B2F]">{plan.name}</h3>
                        <p className="mt-1 text-xs font-semibold text-[#667196]">{plan.tagline}</p>
                        <div className="mt-5">
                          {displayPlan.oldPrice ? (
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-base font-extrabold text-[#98A1BF] line-through">Rs{displayPlan.oldPrice}</span>
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-extrabold text-emerald-600">{plan.discount}</span>
                            </div>
                          ) : null}
                          <div className="flex items-end gap-1">
                            <span className="text-3xl font-extrabold text-[#080B2F]">Rs{displayPlan.price}</span>
                            <span className="pb-1 text-xs font-bold text-[#455079]">{displayPlan.suffix}</span>
                          </div>
                          <p className="mt-2 text-xs font-bold text-[#667196]">{displayPlan.helper}</p>
                        </div>
                        <ul className="mt-4 space-y-2">
                          {plan.features.slice(0, 5).map((item) => (
                            <li key={item} className="flex items-start gap-2 text-xs font-semibold text-[#455079]">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              {item}
                            </li>
                          ))}
                        </ul>
                        <button
                          className={cn(
                            "mt-auto h-10 rounded-[8px] border text-xs font-extrabold transition hover:-translate-y-0.5",
                            plan.name === "Starter" || plan.name === "Enterprise"
                              ? "border-[#8A2BFF] bg-white text-[#6D28D9] hover:bg-violet-50"
                              : "border-transparent bg-[linear-gradient(100deg,#7C2DFF,#B22BFF)] text-white shadow-[0_18px_36px_-18px_rgba(124,45,255,0.7)]"
                          )}
                          type="button"
                          onClick={() => {
                            if (plan.name === "Enterprise") {
                              scrollToSection("contact");
                            } else {
                              openRegister();
                            }
                          }}
                        >
                          {plan.action}
                        </button>
                      </article>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-[10px] border border-[#DDE3F2] bg-white p-4 shadow-[0_16px_42px_-34px_rgba(8,11,47,0.42)]">
                  <div className="grid grid-cols-4 gap-3">
                    {addOns.map((addOn) => {
                      const Icon = addOn.icon;
                      return (
                        <div key={addOn.title} className="flex items-center gap-3 border-l border-[#E7EBF7] px-3">
                          <span className="grid h-9 w-9 place-items-center rounded-[9px] border border-violet-100 text-[#7C2DFF]">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-xs font-extrabold text-[#080B2F]">{addOn.title}</p>
                            <p className="text-[11px] font-bold text-[#667196]">{addOn.text}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : null}

            {activeSection === "resources" ? (
              <section className="animate-in fade-in duration-300">
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#6D28D9]">Resources</p>
                <h2 className="mt-3 max-w-[760px] text-[clamp(2.4rem,4vw,4.5rem)] font-extrabold leading-tight text-[#080B2F]">
                  Everything your team needs to move work forward
                </h2>
                <div className="mt-8 grid grid-cols-3 gap-5">
                  {[
                    ["Project playbooks", "Templates for sprint planning, bug triage, and release reviews."],
                    ["Team dashboards", "Shared views for owners, priorities, blockers, and delivery health."],
                    ["Security guides", "Practical controls for access, audit trails, and workspace safety."],
                  ].map(([title, text]) => (
                    <article key={title} className="min-h-[210px] rounded-[10px] border border-[#E7EBF7] bg-white p-6 shadow-[0_16px_42px_-34px_rgba(8,11,47,0.42)]">
                      <h3 className="text-lg font-extrabold text-[#080B2F]">{title}</h3>
                      <p className="mt-4 text-sm font-semibold leading-6 text-[#667196]">{text}</p>
                    </article>
                  ))}
                </div>
                <button className="mt-8 h-11 rounded-[8px] border border-[#8A2BFF] px-6 text-sm font-extrabold text-[#6D28D9] transition hover:bg-violet-50" type="button" onClick={openRegister}>
                  Explore Resources
                </button>
              </section>
            ) : null}

            {activeSection === "enterprise" ? (
              <section className="animate-in fade-in duration-300 rounded-[10px] border border-[#DDE3F2] bg-[linear-gradient(135deg,#F8FAFF,#F4F0FF)] p-8 shadow-[0_16px_42px_-34px_rgba(8,11,47,0.42)]">
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#6D28D9]">Enterprise</p>
                <h2 className="mt-3 max-w-[780px] text-[clamp(2.4rem,4vw,4.5rem)] font-extrabold leading-tight text-[#080B2F]">
                  Governance, scale, and support for larger teams
                </h2>
                <p className="mt-5 max-w-[720px] text-base font-semibold leading-7 text-[#667196]">
                  Configure secure workspaces with dedicated support, SSO readiness,
                  custom integrations, and audit-friendly project history.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-4">
                  {["SSO & SCIM", "Dedicated Support", "Advanced Security"].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-[10px] bg-white px-5 py-4 text-sm font-extrabold text-[#080B2F]">
                      <ShieldCheck className="h-5 w-5 text-[#6D28D9]" />
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {activeSection === "contact" ? (
              <section className="animate-in fade-in duration-300 rounded-[10px] border border-[#DDE3F2] bg-white p-8 shadow-[0_16px_42px_-34px_rgba(8,11,47,0.42)]">
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#6D28D9]">Contact Sales</p>
                <h2 className="mt-3 max-w-[760px] text-[clamp(2.4rem,4vw,4.5rem)] font-extrabold leading-tight text-[#080B2F]">
                  Plan the right CureCode workspace
                </h2>
                <p className="mt-5 max-w-[680px] text-base font-semibold leading-7 text-[#667196]">
                  Talk through pricing, onboarding, and controls for your team size.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[linear-gradient(100deg,#8428E8,#1178F2)] px-6 text-sm font-extrabold text-white shadow-[0_16px_36px_-18px_rgba(109,40,217,0.8)]" href="mailto:sales@curecode.com">
                    Email Sales
                  </a>
                  <button className="h-11 rounded-[8px] border border-[#8A2BFF] px-6 text-sm font-extrabold text-[#6D28D9] transition hover:bg-violet-50" type="button" onClick={openRegister}>
                    Create Account
                  </button>
                </div>
                <div className="mt-8 grid grid-cols-3 gap-4">
                  {trustBadges.slice(0, 3).map(([title, text, Icon]) => (
                    <div key={title} className="flex items-center gap-3 rounded-[10px] bg-[#F7F8FE] p-4">
                      <span className="grid h-10 w-10 place-items-center rounded-[8px] bg-white text-[#455079]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-extrabold text-[#080B2F]">{title}</p>
                        <p className="text-xs font-semibold text-[#667196]">{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>

        <aside className="relative flex min-h-[900px] flex-col justify-center gap-7 bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFAFF_100%)] px-5 py-8 sm:px-8 lg:px-14 xl:h-full xl:min-h-0 xl:overflow-hidden xl:px-16">
          <div className="absolute right-8 top-8 hidden rounded-full bg-[#F2EAFE] px-7 py-2 text-sm font-extrabold text-[#080B2F] md:inline-flex">
            <span className="mr-6 text-[#7C2DFF]">v2.0</span>
            New & Improved
          </div>

          <div className="mx-auto w-full max-w-[560px] rounded-[14px] border border-[#DDE3F2] bg-white p-[clamp(1.25rem,2.2vw,2.1rem)] shadow-[0_24px_80px_-48px_rgba(8,11,47,0.45)] xl:max-h-[calc(100vh-3rem)] xl:overflow-hidden">
            <div className="mb-7">
              <p className="text-base font-extrabold text-[#6D28D9]">{authEyebrow}</p>
              <h2
                className="mt-3 text-[clamp(1.9rem,2.5vw,2.65rem)] font-extrabold leading-tight text-[#080B2F]"
                style={{ fontFamily: '"Poppins", "Inter", sans-serif' }}
              >
                {authTitle}
              </h2>
              <p className="mt-3 text-base font-semibold text-[#667196]">{authSubtitle}</p>
              {mode === "login" && rememberedLogin ? (
                <div className="mt-5 flex items-center gap-3 rounded-[10px] border border-[#E7EBF7] bg-[#FAFBFF] px-4 py-3">
                  <UserAvatar user={rememberedUser} className="h-10 w-10 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-[#080B2F]">{rememberedUser?.name || rememberedLogin.email}</p>
                    <p className="truncate text-xs font-semibold text-[#667196]">Saved workspace login</p>
                  </div>
                </div>
              ) : null}
            </div>

            {mode === "forgot" ? (
              <form className="space-y-5" onSubmit={handlePasswordResetSubmit}>
                {successMessage ? (
                  <div className="flex items-start gap-3 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                ) : null}

                {resetStep === "request" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="reset-email">Email</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                      <Input
                        aria-invalid={Boolean(resetErrors.email)}
                        autoComplete="email"
                        className={cn(fieldClassName, resetErrors.email && "border-rose-300 focus-visible:border-rose-400")}
                        disabled={isResetPending}
                        id="reset-email"
                        name="email"
                        placeholder="name@company.com"
                        type="email"
                        value={resetForm.email}
                        onChange={handleResetChange}
                      />
                    </div>
                    {resetErrors.email ? <p className="text-sm font-semibold text-rose-500">{resetErrors.email}</p> : null}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-[10px] border border-[#E7EBF7] bg-[#FAFBFF] px-4 py-3">
                    <Mail className="h-5 w-5 text-[#8B94B8]" />
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#667196]">Reset email</p>
                      <p className="truncate text-sm font-extrabold text-[#080B2F]">{resetForm.email}</p>
                    </div>
                  </div>
                )}

                {resetStep === "reset" ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="otp">OTP</label>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                        <Input
                          aria-invalid={Boolean(resetErrors.otp)}
                          autoComplete="one-time-code"
                          className={cn(fieldClassName, "tracking-[0.32em]", resetErrors.otp && "border-rose-300 focus-visible:border-rose-400")}
                          disabled={isResetPending}
                          id="otp"
                          inputMode="numeric"
                          name="otp"
                          placeholder="000000"
                          value={resetForm.otp}
                          onChange={handleResetChange}
                        />
                      </div>
                      {resetErrors.otp ? <p className="text-sm font-semibold text-rose-500">{resetErrors.otp}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="newPassword">New password</label>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                        <Input
                          aria-invalid={Boolean(resetErrors.newPassword)}
                          autoComplete="new-password"
                          className={cn(passwordFieldClassName, resetErrors.newPassword && "border-rose-300 focus-visible:border-rose-400")}
                          disabled={isResetPending}
                          id="newPassword"
                          name="newPassword"
                          placeholder="Create a new password"
                          type={showResetPassword ? "text" : "password"}
                          value={resetForm.newPassword}
                          onChange={handleResetChange}
                        />
                        <button
                          aria-label={showResetPassword ? "Hide password" : "Show password"}
                          className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[#667196] transition hover:bg-[#F4F6FC] hover:text-[#080B2F]"
                          disabled={isResetPending}
                          type="button"
                          onClick={() => setShowResetPassword((current) => !current)}
                        >
                          {showResetPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                      {resetErrors.newPassword ? <p className="text-sm font-semibold text-rose-500">{resetErrors.newPassword}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="confirmPassword">Confirm password</label>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                        <Input
                          aria-invalid={Boolean(resetErrors.confirmPassword)}
                          autoComplete="new-password"
                          className={cn(passwordFieldClassName, resetErrors.confirmPassword && "border-rose-300 focus-visible:border-rose-400")}
                          disabled={isResetPending}
                          id="confirmPassword"
                          name="confirmPassword"
                          placeholder="Confirm new password"
                          type={showResetPassword ? "text" : "password"}
                          value={resetForm.confirmPassword}
                          onChange={handleResetChange}
                        />
                      </div>
                      {resetErrors.confirmPassword ? <p className="text-sm font-semibold text-rose-500">{resetErrors.confirmPassword}</p> : null}
                    </div>
                  </>
                ) : null}

                {resetError ? (
                  <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                    {getAuthErrorMessage(resetError)}
                  </div>
                ) : null}

                <Button className="group h-12 w-full rounded-[8px] border-0 bg-[linear-gradient(100deg,#8428E8,#1178F2)] text-base font-extrabold text-white shadow-[0_18px_42px_-18px_rgba(109,40,217,0.75)] transition duration-300 hover:-translate-y-0.5" disabled={isResetPending} type="submit">
                  {resetSubmitLabel}
                  {isResetPending ? <Sparkles className="h-5 w-5 animate-pulse" /> : <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />}
                </Button>
                <button className="w-full rounded-[8px] px-3 py-2 text-sm font-extrabold text-[#6D28D9] transition hover:bg-violet-50" disabled={isResetPending} type="button" onClick={backToLogin}>
                  Back to login
                </button>
              </form>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  if (mode === "register" && registerStep === "profile") {
                    event.preventDefault();
                    continueRegisterProfile();
                    return;
                  }

                  handleSubmit(event);
                }}
              >
                {successMessage ? (
                  <div className="flex items-start gap-3 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                ) : null}

                {mode === "register" ? (
                  <div className="grid grid-cols-2 gap-3 rounded-[10px] bg-[#F7F8FE] p-1 text-sm font-extrabold">
                    <button
                      className={cn(
                        "h-9 rounded-[8px] transition",
                        registerStep === "profile" ? "bg-white text-[#6D28D9] shadow-sm" : "text-[#667196]"
                      )}
                      type="button"
                      onClick={() => setRegisterStep("profile")}
                    >
                      Profile
                    </button>
                    <button
                      className={cn(
                        "h-9 rounded-[8px] transition",
                        registerStep === "security" ? "bg-white text-[#6D28D9] shadow-sm" : "text-[#667196]"
                      )}
                      type="button"
                      onClick={continueRegisterProfile}
                    >
                      Security
                    </button>
                  </div>
                ) : null}

                {mode === "register" && registerStep === "profile" ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="fullName">Full name</label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                        <Input aria-invalid={Boolean(fieldErrors.fullName)} className={cn(fieldClassName, fieldErrors.fullName && "border-rose-300 focus-visible:border-rose-400")} disabled={authMutation.isPending} id="fullName" name="fullName" placeholder="Your name" value={formData.fullName} onChange={handleChange} />
                      </div>
                      {fieldErrors.fullName ? <p className="text-sm font-semibold text-rose-500">{fieldErrors.fullName}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="email">Email</label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                        <Input aria-invalid={Boolean(fieldErrors.email)} autoComplete="email" className={cn(fieldClassName, fieldErrors.email && "border-rose-300 focus-visible:border-rose-400")} disabled={authMutation.isPending} id="email" name="email" placeholder="name@company.com" type="email" value={formData.email} onChange={handleChange} />
                      </div>
                      {fieldErrors.email ? <p className="text-sm font-semibold text-rose-500">{fieldErrors.email}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="role">Role</label>
                      <select
                        className="h-12 w-full rounded-[10px] border border-[#DFE4F2] bg-white px-4 text-[15px] font-semibold text-[#080B2F] shadow-[0_8px_22px_-18px_rgba(8,11,47,0.38)] transition focus:border-[#6D28D9] focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                        disabled={authMutation.isPending}
                        id="role"
                        name="role"
                        value={formData.role}
                        onChange={handleChange}
                      >
                        <option>Developer</option>
                        <option>Tester</option>
                        <option>Admin</option>
                      </select>
                    </div>

                    <Button className="group h-12 w-full rounded-[8px] border-0 bg-[linear-gradient(100deg,#8428E8,#1178F2)] text-base font-extrabold text-white shadow-[0_18px_42px_-18px_rgba(109,40,217,0.75)] transition duration-300 hover:-translate-y-0.5" disabled={authMutation.isPending} type="button" onClick={continueRegisterProfile}>
                      Continue
                      <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
                    </Button>
                  </>
                ) : null}

                {(mode === "login" || registerStep === "security") ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="email">Email</label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                        <Input aria-invalid={Boolean(fieldErrors.email)} autoComplete="email" className={cn(fieldClassName, fieldErrors.email && "border-rose-300 focus-visible:border-rose-400")} disabled={authMutation.isPending || mode === "register"} id="email" name="email" placeholder="name@company.com" type="email" value={formData.email} onChange={handleChange} />
                      </div>
                      {fieldErrors.email ? <p className="text-sm font-semibold text-rose-500">{fieldErrors.email}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="password">Password</label>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                        <Input aria-invalid={Boolean(fieldErrors.password)} autoComplete={mode === "login" ? "current-password" : "new-password"} className={cn(passwordFieldClassName, fieldErrors.password && "border-rose-300 focus-visible:border-rose-400")} disabled={authMutation.isPending} id="password" name="password" placeholder={mode === "login" ? "Enter your password" : "Create a secure password"} type={showPassword ? "text" : "password"} value={formData.password} onChange={handleChange} />
                        <button aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[#667196] transition hover:bg-[#F4F6FC] hover:text-[#080B2F]" disabled={authMutation.isPending} type="button" onClick={() => setShowPassword((current) => !current)}>
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                      {fieldErrors.password ? <p className="text-sm font-semibold text-rose-500">{fieldErrors.password}</p> : null}
                    </div>
                  </>
                ) : null}

                {mode === "register" && registerStep === "security" ? (
                  <button className="w-full rounded-[8px] px-3 py-2 text-sm font-extrabold text-[#6D28D9] transition hover:bg-violet-50" disabled={authMutation.isPending} type="button" onClick={() => setRegisterStep("profile")}>
                    Back to profile
                  </button>
                ) : null}

                {mode === "login" ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <label className="flex min-w-0 cursor-pointer items-center gap-2.5 text-[#080B2F]">
                      <input checked={rememberMe} className="h-4 w-4 shrink-0 rounded border-[#C5CCE2] text-[#1178F2] focus:ring-2 focus:ring-blue-500/20" disabled={authMutation.isPending} type="checkbox" onChange={handleRememberMeChange} />
                      <span className="truncate font-extrabold">Remember me</span>
                      <span className="shrink-0 font-semibold text-[#667196]">30 days</span>
                    </label>
                    <button className="shrink-0 font-extrabold text-[#6D28D9] transition hover:text-[#1178F2]" disabled={authMutation.isPending} type="button" onClick={openForgotPassword}>
                      Forgot Password?
                    </button>
                  </div>
                ) : null}

                {canUseDefaultPassword && mode === "login" ? (
                  <button className="rounded-[8px] border border-violet-100 bg-violet-50 px-3 py-2 text-sm font-extrabold text-[#6D28D9] transition hover:border-violet-200 hover:bg-violet-100 disabled:cursor-wait disabled:opacity-70" disabled={authMutation.isPending} type="button" onClick={handleUseDefaultPassword}>
                    Use Default Password
                  </button>
                ) : null}

                {authMutation.error ? (
                  <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                    {getAuthErrorMessage(authMutation.error)}
                  </div>
                ) : null}

                {(mode === "login" || registerStep === "security") ? (
                  <Button className="group h-12 w-full rounded-[8px] border-0 bg-[linear-gradient(100deg,#8428E8,#1178F2)] text-base font-extrabold text-white shadow-[0_18px_42px_-18px_rgba(109,40,217,0.75)] transition duration-300 hover:-translate-y-0.5" disabled={authMutation.isPending} type="submit">
                    {submitLabel}
                    {authMutation.isPending ? <Sparkles className="h-5 w-5 animate-pulse" /> : <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />}
                  </Button>
                ) : null}

                {mode === "login" ? (
                  <>
                    <div className="flex items-center gap-4 py-1">
                      <span className="h-px flex-1 bg-[#E7EBF7]" />
                      <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#8B94B8]">or continue with</span>
                      <span className="h-px flex-1 bg-[#E7EBF7]" />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <button className="flex h-12 items-center justify-center gap-3 rounded-[8px] border border-[#DFE4F2] bg-white text-sm font-extrabold text-[#080B2F] shadow-sm transition hover:-translate-y-0.5 hover:border-violet-100 hover:shadow-md" type="button">
                        <span className="grid h-5 w-5 place-items-center rounded-full border border-[#DFE4F2] text-sm font-extrabold text-[#1178F2]">G</span>
                        Google
                      </button>
                      <button className="flex h-12 items-center justify-center gap-3 rounded-[8px] border border-[#DFE4F2] bg-white text-sm font-extrabold text-[#080B2F] shadow-sm transition hover:-translate-y-0.5 hover:border-violet-100 hover:shadow-md" type="button">
                        <span className="grid h-5 w-5 grid-cols-2 gap-0.5">
                          <span className="bg-[#F25022]" />
                          <span className="bg-[#7FBA00]" />
                          <span className="bg-[#00A4EF]" />
                          <span className="bg-[#FFB900]" />
                        </span>
                        Microsoft
                      </button>
                      <button className="flex h-12 items-center justify-center gap-3 rounded-[8px] border border-[#DFE4F2] bg-white text-sm font-extrabold text-[#080B2F] shadow-sm transition hover:-translate-y-0.5 hover:border-violet-100 hover:shadow-md" type="button">
                        <Code2 className="h-5 w-5" />
                        GitHub
                      </button>
                      <button className="flex h-12 items-center justify-center gap-3 rounded-[8px] border border-[#DFE4F2] bg-white text-sm font-extrabold text-[#080B2F] shadow-sm transition hover:-translate-y-0.5 hover:border-violet-100 hover:shadow-md" type="button">
                        <ShieldCheck className="h-5 w-5 text-[#6D28D9]" />
                        SSO / SAML
                      </button>
                    </div>
                  </>
                ) : null}

                <p className="text-center text-sm font-semibold text-[#667196]">
                  {mode === "login" ? "Don't have an account? " : "Already have an account? "}
                  <button className="font-extrabold text-[#6D28D9] transition hover:text-[#1178F2]" disabled={authMutation.isPending} type="button" onClick={switchAuthMode}>
                    {mode === "login" ? "Create Account" : "Sign in"}
                  </button>
                </p>
              </form>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
};

export default AuthPage;
