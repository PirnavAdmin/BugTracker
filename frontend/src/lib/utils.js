import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export {
  formatDate,
  formatDatePickerDisplay,
  formatDateTime,
  formatRelativeDateLabel,
  formatTime,
  getIndianDateKey,
  INDIAN_LOCALE,
  INDIAN_TIME_ZONE,
} from "@/lib/date-time";
import {
  formatDate,
  formatDateTime,
  formatTime,
} from "@/lib/date-time";

export const cn = (...inputs) => twMerge(clsx(inputs));

export const getInitials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
