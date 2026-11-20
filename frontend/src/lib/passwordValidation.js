const passwordChecks = (password = "") => ({
  minLength: password.length >= 8,
  uppercase: /[A-Z]/.test(password),
  lowercase: /[a-z]/.test(password),
  number: /\d/.test(password),
  special: /[^A-Za-z0-9\s]/.test(password),
});

export const getPasswordValidationError = (password = "") => {
  const checks = passwordChecks(password);
  const missingRequirements = [];

  if (!checks.minLength) missingRequirements.push("at least 8 characters");
  if (!checks.uppercase) missingRequirements.push("an uppercase letter");
  if (!checks.lowercase) missingRequirements.push("a lowercase letter");
  if (!checks.number) missingRequirements.push("a number");
  if (!checks.special) missingRequirements.push("a special character");

  return missingRequirements.length
    ? `Password must include ${missingRequirements.join(", ")}.`
    : "";
};

export const getPasswordStrength = (password = "") => {
  if (!password) {
    return { label: "Not set", tone: "slate", width: 0 };
  }

  const score = Object.values(passwordChecks(password)).filter(Boolean).length;

  if (score <= 2) {
    return { label: "Weak", tone: "rose", width: 34 };
  }

  if (score < 5) {
    return { label: "Medium", tone: "amber", width: 68 };
  }

  return { label: "Strong", tone: "emerald", width: 100 };
};
