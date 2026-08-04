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
  Presentation,
  Shield,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Video,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import pirnavLogo from "@/assets/pirnav-logo.png";
import workspacePreview from "@/assets/auth/bug-tracker-workspace-login.png";
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
  const marketingScrollerRef = useRef(null);
  const sectionRefs = useRef({});
  const isAdminRoute = location.pathname === ADMIN_ROUTE_PATH;
  const canUseDefaultPassword =
    mode === "login" &&
    isAdminRoute &&
    isAdminDefaultLoginEnabledOnClient;
  const sectionOrder = useMemo(
    () => ["hero", "features", "pricing", "resources", "enterprise", "contact"],
    []
  );

  const scrollToSection = (sectionId, options = {}) => {
    const sectionNode = sectionRefs.current[sectionId];
    const scrollerNode = marketingScrollerRef.current;

    if (!sectionNode || !scrollerNode) {
      return;
    }

    const top = sectionNode.offsetTop - 24;
    scrollerNode.scrollTo({
      top,
      behavior: options.behavior || "smooth",
    });

    if (options.updateHash !== false) {
      navigate(`${location.pathname}#${sectionId}`, { replace: true });
    }
  };

  const setSectionRef = (sectionId) => (node) => {
    if (node) {
      sectionRefs.current[sectionId] = node;
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

    window.requestAnimationFrame(() => {
      scrollToSection(hashSection, { behavior: "auto", updateHash: false });
    });
  }, [location.hash, sectionOrder]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      const scrollerNode = marketingScrollerRef.current;

      if (!scrollerNode || scrollerNode.matches(":hover")) {
        return;
      }

      const currentTop = scrollerNode.scrollTop;
      const currentIndex = sectionOrder.reduce((activeIndex, sectionId, index) => {
        const sectionTop = sectionRefs.current[sectionId]?.offsetTop || 0;
        return sectionTop - 80 <= currentTop ? index : activeIndex;
      }, 0);
      const nextSection = sectionOrder[(currentIndex + 1) % sectionOrder.length];

      scrollToSection(nextSection, { updateHash: false });
    }, 7000);

    return () => window.clearInterval(timerId);
  }, [sectionOrder]);

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
    setMode((current) => (current === "login" ? "register" : "login"));
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

  return (
    <main
      className="min-h-[var(--app-viewport-height)] overflow-y-auto bg-[#FBFCFF] text-[#080B2F] xl:h-[var(--app-viewport-height)] xl:overflow-hidden"
      style={{ fontFamily: '"Inter", sans-serif' }}
    >
      <div className="mx-auto grid min-h-full max-w-[1920px] grid-cols-1 xl:h-full xl:grid-cols-[minmax(0,1.86fr)_minmax(480px,0.98fr)]">
        <section
          ref={marketingScrollerRef}
          className="relative overflow-visible border-r border-[#E7EBF7] px-5 py-6 sm:px-8 lg:px-10 xl:h-full xl:overflow-y-auto xl:overscroll-contain xl:scroll-smooth xl:px-12 xl:[scrollbar-width:none] xl:[&::-webkit-scrollbar]:hidden"
        >
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_14%,rgba(37,99,235,0.08),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(124,58,237,0.08),transparent_24%),linear-gradient(135deg,#FFFFFF_0%,#F7FAFF_54%,#FBF8FF_100%)]" />

          <header className="sticky top-0 z-20 -mx-5 flex flex-wrap items-center justify-between gap-5 border-b border-[#E7EBF7]/70 bg-[#FBFCFF]/92 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10 xl:-mx-12 xl:px-12">
            <img src={pirnavLogo} alt="CureCode" className="h-12 w-auto object-contain sm:h-14" />
            <nav className="hidden items-center gap-10 text-[15px] font-extrabold text-[#080B2F] lg:flex">
              <button className="inline-flex items-center gap-2 transition hover:text-[#6D28D9]" type="button" onClick={() => scrollToSection("features")}>
                Features <ChevronDown className="h-4 w-4" />
              </button>
              <button className="transition hover:text-[#6D28D9]" type="button" onClick={() => scrollToSection("pricing")}>Pricing</button>
              <button className="inline-flex items-center gap-2 transition hover:text-[#6D28D9]" type="button" onClick={() => scrollToSection("resources")}>
                Resources <ChevronDown className="h-4 w-4" />
              </button>
              <button className="transition hover:text-[#6D28D9]" type="button" onClick={() => scrollToSection("enterprise")}>Enterprise</button>
              <button className="transition hover:text-[#6D28D9]" type="button" onClick={() => scrollToSection("contact")}>Contact Sales</button>
            </nav>
          </header>

          <div ref={setSectionRef("hero")} className="mt-10 max-w-[760px] lg:mt-14">
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

          <div ref={setSectionRef("features")} className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="rounded-[10px] border border-white bg-white/88 p-4 shadow-[0_16px_44px_-32px_rgba(8,11,47,0.42)]">
                  <div className={cn("mb-3 grid h-10 w-10 place-items-center rounded-[9px]", getFeatureTone(feature.tone))}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-extrabold text-[#080B2F]">{feature.title}</h3>
                  <p className="mt-2 text-xs font-semibold leading-5 text-[#667196]">{feature.text}</p>
                </div>
              );
            })}
          </div>

          <section ref={setSectionRef("pricing")} className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-[clamp(1.35rem,2vw,2rem)] font-extrabold text-[#080B2F]">
                Simple, flexible pricing for teams of all sizes
              </h2>
              <div className="flex flex-wrap items-center gap-5">
                <div className="inline-flex items-center rounded-full border border-[#D9DEF2] bg-white p-1 text-sm font-extrabold shadow-sm">
                  <span className="rounded-full bg-[#F4F0FF] px-5 py-2 text-[#080B2F]">Monthly</span>
                  <span className="px-4 py-2 text-[#667196]">Yearly</span>
                  <span className="rounded-full bg-emerald-50 px-4 py-2 text-emerald-600">Save up to 20%</span>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-bold text-[#455079]">
                  All prices in INR <Info className="h-4 w-4" />
                </span>
              </div>
            </div>

            <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
              {pricingPlans.map((plan) => (
                <article
                  key={plan.name}
                  className={cn(
                    "relative flex min-h-[430px] flex-col rounded-[10px] border bg-white p-6 shadow-[0_18px_50px_-36px_rgba(8,11,47,0.4)]",
                    plan.popular ? "border-[#8A2BFF] ring-1 ring-[#8A2BFF]" : "border-[#DDE3F2]"
                  )}
                >
                  {plan.popular ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-t-[8px] bg-[linear-gradient(100deg,#7C2DFF,#A433FF)] px-7 py-1.5 text-xs font-extrabold uppercase text-white">
                      Most Popular
                    </div>
                  ) : null}
                  <h3 className="text-xl font-extrabold text-[#080B2F]">{plan.name}</h3>
                  <p className="mt-2 text-sm font-semibold text-[#667196]">{plan.tagline}</p>
                  <div className="mt-7">
                    {plan.oldPrice ? (
                      <div className="mb-1 flex items-center gap-3">
                        <span className="text-lg font-extrabold text-[#98A1BF] line-through">Rs{plan.oldPrice}</span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-600">{plan.discount}</span>
                      </div>
                    ) : null}
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-extrabold text-[#080B2F]">Rs{plan.price}</span>
                      <span className="pb-1 text-sm font-bold text-[#455079]">{plan.suffix}</span>
                    </div>
                    {plan.oldPrice ? (
                      <span className="mt-4 inline-flex rounded-[8px] bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-700">
                        Offer ends in 13d : 08h : 45m
                      </span>
                    ) : null}
                  </div>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm font-semibold text-[#455079]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <button
                    className={cn(
                      "mt-auto h-11 rounded-[8px] border text-sm font-extrabold transition hover:-translate-y-0.5",
                      plan.name === "Starter" || plan.name === "Enterprise"
                        ? "border-[#8A2BFF] bg-white text-[#6D28D9] hover:bg-violet-50"
                        : "border-transparent bg-[linear-gradient(100deg,#7C2DFF,#B22BFF)] text-white shadow-[0_18px_36px_-18px_rgba(124,45,255,0.7)]"
                    )}
                    type="button"
                    onClick={() => {
                      if (plan.name === "Enterprise") {
                        scrollToSection("contact");
                      } else {
                        setMode("register");
                      }
                    }}
                  >
                    {plan.action}
                  </button>
                  {plan.name === "Growth" || plan.name === "Business" ? (
                    <p className="mt-3 text-center text-sm font-bold text-[#6D28D9]">14-Day Free Trial</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <div className="mt-6 rounded-[10px] border border-[#DDE3F2] bg-white p-5 shadow-[0_16px_42px_-34px_rgba(8,11,47,0.42)]">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-[180px]">
                <p className="text-sm font-extrabold text-[#080B2F]">Add-Ons <span className="text-[#6D28D9]">(Scale as you grow)</span></p>
              </div>
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {addOns.map((addOn) => {
                  const Icon = addOn.icon;
                  return (
                    <div key={addOn.title} className="flex items-center gap-3 border-l border-[#E7EBF7] px-4">
                      <span className="grid h-10 w-10 place-items-center rounded-[9px] border border-violet-100 text-[#7C2DFF]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-extrabold text-[#080B2F]">{addOn.title}</p>
                        <p className="text-xs font-bold text-[#667196]">{addOn.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <section ref={setSectionRef("resources")} className="mt-8 rounded-[10px] border border-[#DDE3F2] bg-white p-6 shadow-[0_16px_42px_-34px_rgba(8,11,47,0.42)]">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#6D28D9]">Resources</p>
                <h2 className="mt-2 text-2xl font-extrabold text-[#080B2F]">Everything your team needs to move work forward</h2>
              </div>
              <button className="h-10 rounded-[8px] border border-[#8A2BFF] px-5 text-sm font-extrabold text-[#6D28D9] transition hover:bg-violet-50" type="button" onClick={() => setMode("register")}>
                Explore Resources
              </button>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                ["Project playbooks", "Templates for sprint planning, bug triage, and release reviews."],
                ["Team dashboards", "Shared views for owners, priorities, blockers, and delivery health."],
                ["Security guides", "Practical controls for access, audit trails, and workspace safety."],
              ].map(([title, text]) => (
                <article key={title} className="rounded-[10px] border border-[#E7EBF7] bg-[#FAFBFF] p-5">
                  <h3 className="text-base font-extrabold text-[#080B2F]">{title}</h3>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[#667196]">{text}</p>
                </article>
              ))}
            </div>
          </section>

          <section ref={setSectionRef("enterprise")} className="mt-8 rounded-[10px] border border-[#DDE3F2] bg-[linear-gradient(135deg,#F8FAFF,#F4F0FF)] p-6 shadow-[0_16px_42px_-34px_rgba(8,11,47,0.42)]">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#6D28D9]">Enterprise</p>
                <h2 className="mt-2 text-2xl font-extrabold text-[#080B2F]">Governance, scale, and support for larger teams</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-[#667196]">
                  Configure secure workspaces with dedicated support, SSO readiness,
                  custom integrations, and audit-friendly project history.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {["SSO & SCIM", "Dedicated Support", "Advanced Security"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-[10px] bg-white px-4 py-3 text-sm font-extrabold text-[#080B2F]">
                    <ShieldCheck className="h-5 w-5 text-[#6D28D9]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section ref={setSectionRef("contact")} className="mt-8 rounded-[10px] border border-[#DDE3F2] bg-white p-6 shadow-[0_16px_42px_-34px_rgba(8,11,47,0.42)]">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#6D28D9]">Contact Sales</p>
                <h2 className="mt-2 text-2xl font-extrabold text-[#080B2F]">Plan the right CureCode workspace</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-[#667196]">
                  Talk through pricing, onboarding, and controls for your team size.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[linear-gradient(100deg,#8428E8,#1178F2)] px-6 text-sm font-extrabold text-white shadow-[0_16px_36px_-18px_rgba(109,40,217,0.8)]" href="mailto:sales@curecode.com">
                  Email Sales
                </a>
                <button className="h-11 rounded-[8px] border border-[#8A2BFF] px-6 text-sm font-extrabold text-[#6D28D9] transition hover:bg-violet-50" type="button" onClick={() => setMode("register")}>
                  Create Account
                </button>
              </div>
            </div>
          </section>

          <div className="mt-6 grid grid-cols-1 gap-4 pb-8 sm:grid-cols-2 xl:grid-cols-5">
            {trustBadges.map(([title, text, Icon]) => (
              <div key={title} className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-[8px] bg-[#F1F4FF] text-[#455079]">
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

        <aside className="relative flex min-h-[900px] flex-col justify-center gap-7 bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFAFF_100%)] px-5 py-8 sm:px-8 lg:px-14 xl:h-full xl:min-h-0 xl:overflow-hidden xl:px-16">
          <div className="absolute right-8 top-8 hidden rounded-full bg-[#F2EAFE] px-7 py-2 text-sm font-extrabold text-[#080B2F] md:inline-flex">
            <span className="mr-6 text-[#7C2DFF]">v2.0</span>
            New & Improved
          </div>

          <div className="mx-auto w-full max-w-[560px] rounded-[14px] border border-[#DDE3F2] bg-white p-[clamp(1.25rem,2.2vw,2.1rem)] shadow-[0_24px_80px_-48px_rgba(8,11,47,0.45)] xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:[scrollbar-width:none] xl:[&::-webkit-scrollbar]:hidden">
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
              <form className="space-y-5" onSubmit={handleSubmit}>
                {successMessage ? (
                  <div className="flex items-start gap-3 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                ) : null}

                {mode === "register" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="fullName">Full name</label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                      <Input aria-invalid={Boolean(fieldErrors.fullName)} className={cn(fieldClassName, fieldErrors.fullName && "border-rose-300 focus-visible:border-rose-400")} disabled={authMutation.isPending} id="fullName" name="fullName" placeholder="Your name" value={formData.fullName} onChange={handleChange} />
                    </div>
                    {fieldErrors.fullName ? <p className="text-sm font-semibold text-rose-500">{fieldErrors.fullName}</p> : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="email">Email</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                    <Input aria-invalid={Boolean(fieldErrors.email)} autoComplete="email" className={cn(fieldClassName, fieldErrors.email && "border-rose-300 focus-visible:border-rose-400")} disabled={authMutation.isPending} id="email" name="email" placeholder="name@company.com" type="email" value={formData.email} onChange={handleChange} />
                  </div>
                  {fieldErrors.email ? <p className="text-sm font-semibold text-rose-500">{fieldErrors.email}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-extrabold text-[#080B2F]" htmlFor="password">Password</label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B94B8]" />
                    <Input aria-invalid={Boolean(fieldErrors.password)} autoComplete={mode === "login" ? "current-password" : "new-password"} className={cn(passwordFieldClassName, fieldErrors.password && "border-rose-300 focus-visible:border-rose-400")} disabled={authMutation.isPending} id="password" name="password" placeholder="Enter your password" type={showPassword ? "text" : "password"} value={formData.password} onChange={handleChange} />
                    <button aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[#667196] transition hover:bg-[#F4F6FC] hover:text-[#080B2F]" disabled={authMutation.isPending} type="button" onClick={() => setShowPassword((current) => !current)}>
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {fieldErrors.password ? <p className="text-sm font-semibold text-rose-500">{fieldErrors.password}</p> : null}
                </div>

                {mode === "register" ? (
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

                {canUseDefaultPassword ? (
                  <button className="rounded-[8px] border border-violet-100 bg-violet-50 px-3 py-2 text-sm font-extrabold text-[#6D28D9] transition hover:border-violet-200 hover:bg-violet-100 disabled:cursor-wait disabled:opacity-70" disabled={authMutation.isPending} type="button" onClick={handleUseDefaultPassword}>
                    Use Default Password
                  </button>
                ) : null}

                {authMutation.error ? (
                  <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                    {getAuthErrorMessage(authMutation.error)}
                  </div>
                ) : null}

                <Button className="group h-12 w-full rounded-[8px] border-0 bg-[linear-gradient(100deg,#8428E8,#1178F2)] text-base font-extrabold text-white shadow-[0_18px_42px_-18px_rgba(109,40,217,0.75)] transition duration-300 hover:-translate-y-0.5" disabled={authMutation.isPending} type="submit">
                  {submitLabel}
                  {authMutation.isPending ? <Sparkles className="h-5 w-5 animate-pulse" /> : <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />}
                </Button>

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

          {mode === "login" ? (
            <div className="mx-auto flex w-full max-w-[600px] flex-col gap-6 rounded-[14px] border border-[#ECEBFA] bg-[#F4F0FF] p-6 shadow-[0_20px_70px_-50px_rgba(109,40,217,0.55)] sm:flex-row sm:items-center">
              <div className="flex-1">
                <h3 className="text-lg font-extrabold text-[#080B2F]">Try CureCode free for 14 days</h3>
                <ul className="mt-4 space-y-3 text-sm font-semibold text-[#455079]">
                  {["Full access to all Business features", "Invite your whole team", "Cancel anytime, risk-free"].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-[#7C2DFF]" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button className="mt-5 h-11 rounded-[8px] bg-[linear-gradient(100deg,#8428E8,#A62BFF)] px-9 text-sm font-extrabold text-white shadow-[0_16px_36px_-18px_rgba(109,40,217,0.8)]" type="button" onClick={() => setMode("register")}>
                  Start Free Trial
                </button>
                <p className="mt-3 inline-flex rounded-full bg-white/70 px-4 py-1.5 text-xs font-bold text-[#667196]">No credit card required</p>
              </div>
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[10px] border border-white/80 bg-white shadow-[0_20px_55px_-34px_rgba(8,11,47,0.55)] sm:w-56">
                <img src={workspacePreview} alt="CureCode workspace preview" className="h-full w-full object-cover object-left-top" />
                <div className="absolute bottom-5 right-5 grid h-16 w-16 place-items-center rounded-full bg-[conic-gradient(from_90deg,#1178F2,#7C2DFF,#28D4AE,#1178F2)] text-white shadow-lg">
                  <Presentation className="h-7 w-7" />
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
};

export default AuthPage;
