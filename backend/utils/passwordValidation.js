const getStrongPasswordValidationMessage = (password) => {
  const normalizedPassword = typeof password === "string" ? password : "";
  const missingRequirements = [];

  if (normalizedPassword.length < 8) {
    missingRequirements.push("at least 8 characters");
  }
  if (!/[A-Z]/.test(normalizedPassword)) {
    missingRequirements.push("an uppercase letter");
  }
  if (!/[a-z]/.test(normalizedPassword)) {
    missingRequirements.push("a lowercase letter");
  }
  if (!/\d/.test(normalizedPassword)) {
    missingRequirements.push("a number");
  }
  if (!/[^A-Za-z0-9\s]/.test(normalizedPassword)) {
    missingRequirements.push("a special character");
  }

  return missingRequirements.length
    ? `Password must include ${missingRequirements.join(", ")}.`
    : "";
};

module.exports = { getStrongPasswordValidationMessage };
