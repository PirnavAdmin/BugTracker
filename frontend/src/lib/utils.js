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
  toDateTimeInputValue,
} from "./date-time.js";
import {
  formatDate,
  formatDateTime,
  formatTime,
  toDateTimeInputValue,
} from "./date-time.js";

export const cn = (...inputs) => twMerge(clsx(inputs));

export const getInitials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
