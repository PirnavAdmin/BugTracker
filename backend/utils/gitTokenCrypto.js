const crypto = require("crypto");

const getEncryptionKey = () => {
  const secret =
    process.env.GIT_TOKEN_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    "";

  if (!secret) {
    throw new Error("Git token encryption key is not configured");
  }

  return crypto.createHash("sha256").update(String(secret)).digest();
};

const encryptGitToken = (token = "") => {
  const value = String(token || "").trim();

  if (!value) {
    return "";
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
};

const decryptGitToken = (encryptedValue = "") => {
  const value = String(encryptedValue || "");

  if (!value) {
    return "";
  }

  const [version, ivBase64, tagBase64, encryptedBase64] = value.split(":");

  if (version !== "v1" || !ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("Stored Git token is invalid");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivBase64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

module.exports = {
  decryptGitToken,
  encryptGitToken,
};
