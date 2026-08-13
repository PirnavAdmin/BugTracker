import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import UserAvatar from "@/components/shared/UserAvatar";
import ToastNotice from "@/components/shared/ToastNotice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadProfileAvatar } from "@/lib/api";
import { readStoredSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import {
  Mail,
  Briefcase,
  Users,
  Shield,
  Calendar,
  ArrowRight,
  Edit2,
  Download,
  FileText,
  Camera,
} from "lucide-react";
import { Link } from "react-router-dom";

const ProfilePage = () => {
  const { user, setAuthSession } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!toast?.id) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [toast?.id]);

  const downloadAPK = async () => {
    try {
      const response = await fetch("/downloads/CureCode.apk", {
        method: "HEAD",
        cache: "no-store",
      });

      const contentType = response.headers.get("content-type") || "";

      if (!response.ok || contentType.includes("text/html")) {
        throw new Error("APK_NOT_AVAILABLE");
      }

      const link = document.createElement("a");
      link.href = "/downloads/CureCode.apk";
      link.download = "CureCode.apk";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      setToast({
        id: `apk-download-${Date.now()}`,
        type: "warning",
        title: "APK unavailable",
        message:
          "CureCode.apk is not available right now. Please upload the APK to frontend/public/downloads and redeploy.",
      });
    }
  };

  const avatarMutation = useMutation({
    mutationFn: uploadProfileAvatar,
    onSuccess: (data) => {
      const updatedUser = data?.user;

      if (updatedUser) {
        const storedSession = readStoredSession();
        setAuthSession({
          ...storedSession,
          user: {
            ...storedSession?.user,
            ...updatedUser,
          },
        });
      }

      setUploadError("");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (error) => {
      setUploadError(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to upload profile picture"
      );
    },
  });

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Loading...</h1>
        </div>
      </div>
    );
  }

  const formattedJoinDate = user.createdAt
    ? formatDate(user.createdAt, { fallback: "Not available" })
    : "Not available";
  const teamNames = Array.isArray(user.teams)
    ? user.teams.map((team) => team?.name).filter(Boolean)
    : [];

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    avatarMutation.mutate(file);
    event.target.value = "";
  };

  const infoCards = [
    {
      icon: Mail,
      label: "Email",
      value: user.email,
      color: "blue",
    },
    {
      icon: Briefcase,
      label: "Role",
      value: user.role || "N/A",
      color: "purple",
    },
    {
      icon: Users,
      label: "Teams",
      value: teamNames.length ? teamNames.join(", ") : "No teams assigned",
      color: "green",
    },
    {
      icon: Calendar,
      label: "Member Since",
      value: formattedJoinDate,
      color: "amber",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Header with Avatar */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <UserAvatar
                  user={user}
                  className="h-24 w-24 ring-4 ring-blue-200"
                  fallbackClassName="text-2xl font-bold"
                />
                {isEditing ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarMutation.isPending}
                    className="absolute -bottom-2 -right-2 inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                    aria-label="Upload profile picture"
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
              {isEditing ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <p className="text-center text-xs font-medium text-slate-500">
                    {avatarMutation.isPending
                      ? "Uploading profile picture..."
                      : "Click the camera to upload a photo"}
                  </p>
                  {uploadError ? (
                    <p className="max-w-[14rem] text-center text-xs font-medium text-red-600">
                      {uploadError}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-3xl font-bold text-slate-900">{user.name}</h1>
              <p className="mt-1 text-slate-600">{user.email}</p>
              {user.role && (
                <div className="mt-3 inline-block">
                  <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-700">
                    <Shield className="h-4 w-4" />
                    {user.role}
                  </span>
                </div>
              )}
            </div>

            <Button
              onClick={() => setIsEditing(!isEditing)}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Edit2 className="h-4 w-4" />
              {isEditing ? "Cancel" : "Edit Profile"}
            </Button>
          </div>
        </div>

        {/* Info Grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {infoCards.map((card) => {
            const Icon = card.icon;
            const colorClasses = {
              blue: "bg-blue-50 text-blue-700 ring-blue-200",
              purple: "bg-purple-50 text-purple-700 ring-purple-200",
              green: "bg-green-50 text-green-700 ring-green-200",
              amber: "bg-amber-50 text-amber-700 ring-amber-200",
            };

            return (
              <Card key={card.label} className="border-slate-200">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div
                      className={`rounded-lg ring-2 p-3 ${colorClasses[card.color]}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-600">
                        {card.label}
                      </p>
                      <p className="mt-1 break-words text-lg font-semibold text-slate-900">
                        {card.value}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Account Management Section */}
        <div className="grid grid-cols-1 gap-6">
          {/* Security Card */}
          <Card className="border-slate-200 transition-all hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-red-600" />
                Security
              </CardTitle>
              <CardDescription>Manage your account security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                Change your password regularly to keep your account secure.
              </p>
              <Link to="/settings?tab=password" className="inline-block">
                <Button
                  variant="outline"
                  className="gap-2 w-full justify-between"
                >
                  Change Password
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Account Info Section */}
        <Card className="mt-6 border-slate-200">
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Details about your account and workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 last:border-0">
                <span className="text-sm font-medium text-slate-600">
                  Account Status
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                  <span className="h-2 w-2 rounded-full bg-green-600" />
                  Active
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 last:border-0">
                <span className="text-sm font-medium text-slate-600">
                  Member Since
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {formattedJoinDate}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 last:border-0">
                <span className="text-sm font-medium text-slate-600">
                  Email Verified
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  Verified
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Help Card */}
        <Card className="mt-6 border-slate-200 bg-gradient-to-r from-blue-50 to-blue-100/50">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-slate-900">Need Help?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Check our documentation or contact support if you need assistance.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild variant="outline" size="sm">
                <a
                  href="/docs/pirnav-user-manual.html"
                  download="Pirnav-User-Manual.html"
                >
                  <Download className="h-4 w-4" />
                  Documentation
                </a>
              </Button>
              <Button variant="outline" size="sm">
                Contact Support
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-blue-600 text-white hover:bg-blue-700"
                onClick={downloadAPK}
              >
                <Download className="h-4 w-4" />
                Download APK
              </Button>
              <Button asChild variant="outline" size="sm">
                <a
                  href="/docs/technology-stack-and-deployment.md"
                  download="CureCode-Technology-Stack-and-Deployment.md"
                >
                  <FileText className="h-4 w-4" />
                  Tech Doc
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default ProfilePage;
