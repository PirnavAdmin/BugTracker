const emailPattern =
  /^[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i;

const getEmailValidationError = (email) => {
  if (typeof email !== "string" || !email.trim()) {
    return "Email is required";
  }

  if (/\s/.test(email)) {
    return "Email cannot contain spaces";
  }

  if ((email.match(/@/g) || []).length > 1) {
    return "Email must contain only one @ symbol";
  }

  if (!emailPattern.test(email)) {
    return "Please enter a valid email address";
  }

  return "";
};

module.exports = { getEmailValidationError };
