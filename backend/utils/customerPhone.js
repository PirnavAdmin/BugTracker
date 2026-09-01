const PLACEHOLDER_VALUES = new Set(["", "null", "undefined"]);
const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;

const hasCustomerPhoneValue = (value) => {
  if (value === undefined || value === null) return false;
  return !PLACEHOLDER_VALUES.has(String(value).trim().toLowerCase());
};

const normalizeCashfreeCustomerPhone = (value) => {
  if (!hasCustomerPhoneValue(value)) return "";

  const input = String(value).trim();
  // Only formatting characters are removable. Alphabetic or other content is
  // rejected instead of being silently converted into a different number.
  if (!/^\+?[\d\s()-]+$/.test(input)) return "";

  const compact = input.replace(/[\s()-]/g, "");
  if (!/^\+?\d+$/.test(compact)) return "";

  const explicitInternational = compact.startsWith("+") || compact.startsWith("00");
  let digits = compact.startsWith("+") ? compact.slice(1) : compact;
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Cashfree's Indian subscription checkout expects the national 10-digit
  // mobile number. Accept common Indian representations without duplicating 91.
  if (INDIAN_MOBILE_PATTERN.test(digits)) return digits;
  if (/^0[6-9]\d{9}$/.test(digits)) return digits.slice(1);
  if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
  if (/^091[6-9]\d{9}$/.test(digits)) return digits.slice(3);

  // Values shaped like Indian numbers must not fall through and be mistaken
  // for a different international number when their mobile portion is invalid.
  if (
    (digits.length === 12 && digits.startsWith("91")) ||
    (digits.length === 13 && digits.startsWith("091")) ||
    (digits.length === 14 && digits.startsWith("9191"))
  ) {
    return "";
  }

  // A country code is mandatory for non-Indian values. Preserve valid
  // international numbers in E.164-style form instead of assuming +91.
  if (
    (explicitInternational || digits.length >= 11) &&
    /^[1-9]\d{7,14}$/.test(digits)
  ) {
    return `+${digits}`;
  }

  return "";
};

module.exports = {
  hasCustomerPhoneValue,
  normalizeCashfreeCustomerPhone,
};
