const crypto = require("crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const User = require("../models/User");
const TeamMember = require("../models/TeamMember");
const UserEmailConfig = require("../models/UserEmailConfig");
const {
  clearWorkspaceSenderSelection,
  clearUserSenderSelectionsForSender,
} = require("./settingsController");
const { buildAppUrl } = require("../config/env");
const { sendWorkspaceEmail } = require("../services/emailService");
const asyncHandler = require("../utils/asyncHandler");
const {
  ROLE_ADMIN,
  isEligibleWorkspaceSenderRole,
} = require("../utils/roles");
const {
  normalizeEmail,
  normalizeText,
  parseUserImportCsv,
} = require("../utils/userImportCsv");
const { normalizeWorkspaceId } = require("../utils/workspace");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_IMPORTED_PASSWORD = "pirnav@2025";
const DEFAULT_IMPORTED_ROLE = "Developer";
const normalizeRole = (value) => normalizeText(value);

const toTitleCase = (value) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const buildNameFromEmail = (email) => {
  const localPart = email.split("@")[0] || "";
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();

  return cleaned ? toTitleCase(cleaned) : "Invited User";
};

const generateTemporaryPassword = () =>
  `${crypto.randomBytes(4).toString("hex")}A9!`;

const serializeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  employeeId: user.employeeId || "",
  designation: user.designation || "",
  role: user.role,
  avatarUrl: user.avatarUrl || "",
  workspaceId: normalizeWorkspaceId(user.workspaceId),
  createdAt: user.createdAt,
});

const serializeInvitedUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  employeeId: user.employeeId || "",
  designation: user.designation || "",
  role: user.role,
  avatarUrl: user.avatarUrl || "",
});

const createInvitedUser = async ({
  email,
  role,
  name,
  employeeId,
  designation,
  password,
  workspaceId,
}) => {
  const temporaryPassword = generateTemporaryPassword();
  const user = await User.create({
    name: name || buildNameFromEmail(email),
    email,
    employeeId: employeeId || undefined,
    designation: designation || "",
    password: password || temporaryPassword,
    role,
    workspaceId: normalizeWorkspaceId(workspaceId),
  });

  return {
    temporaryPassword: password ? undefined : temporaryPassword,
    user,
  };
};

const sendInvitationEmail = async ({ email, role, temporaryPassword, workspaceId }) => {
  const loginUrl = buildAppUrl("/login");
  const subject = "Your Pirnav Bug Tracker workspace invite";
  const text = [
    "You have been invited to Pirnav Bug Tracker.",
    `Role: ${role}`,
    `Login: ${loginUrl}`,
    `Temporary password: ${temporaryPassword}`,
    "Please sign in with this temporary password and change it from your profile settings.",
  ].join("\n");

  return sendWorkspaceEmail({
    workspaceId,
    to: email,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #0F172A;">
        <h2 style="margin: 0 0 12px; color: #2563EB;">Welcome to Pirnav Bug Tracker</h2>
        <p style="margin: 0 0 16px;">An administrator invited you to the workspace.</p>
        <p style="margin: 0 0 8px;"><strong>Role:</strong> ${role}</p>
        <p style="margin: 0 0 16px;"><strong>Temporary password:</strong> <code style="background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 8px; padding: 6px 10px;">${temporaryPassword}</code></p>
        <p style="margin: 0 0 20px;">Please sign in with this temporary password and change it from your profile settings.</p>
        <a href="${loginUrl}" style="display: inline-block; background: #2563EB; color: #FFFFFF; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">Open workspace</a>
      </div>
    `,
    text,
  });
};

const getInvitationEmailFailureMessage = (error) => {
  const responseText = String(error?.response || error?.message || "");

  if (error?.code === "EAUTH" || responseText.includes("535")) {
    return "Invitation email could not be sent because the saved SMTP username or password is invalid. The user account was created; share the temporary password manually.";
  }

  if (error?.code === "ENOTFOUND" || error?.code === "EAI_AGAIN") {
    return "Invitation email could not be sent because the SMTP host could not be reached. The user account was created; share the temporary password manually.";
  }

  return "Invitation email could not be sent right now. The user account was created; share the temporary password manually.";
};

const ensureAdminCanChangeRole = async ({ user, role, workspaceId }) => {
  if (user.role === ROLE_ADMIN && role !== ROLE_ADMIN) {
    const adminCount = await User.countDocuments({
      workspaceId,
      role: ROLE_ADMIN,
    });

    if (adminCount <= 1) {
      const error = new Error("At least one admin must remain in the workspace");
      error.statusCode = 400;
      throw error;
    }
  }
};

const getManagedUsers = asyncHandler(async (req, res) => {
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);

  const users = await User.find({
    workspaceId,
  })
    .select("name email employeeId designation role avatarUrl createdAt workspaceId")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(users);
});

const inviteUser = asyncHandler(async (req, res) => {
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const email = normalizeEmail(req.body.email);
  const role = normalizeRole(req.body.role);

  if (!email || !role) {
    res.status(400);
    throw new Error("Email and role are required");
  }

  if (!emailRegex.test(email)) {
    res.status(400);
    throw new Error("Please provide a valid email address");
  }

  if (!User.availableRoles.includes(role)) {
    res.status(400);
    throw new Error(`Role must be one of ${User.availableRoles.join(", ")}`);
  }

  const existingUser = await User.findOne({ email }).select("_id").lean();

  if (existingUser) {
    res.status(409);
    throw new Error("A user with that email already exists");
  }

  const { temporaryPassword, user } = await createInvitedUser({ email, role, workspaceId });
  let emailSent = false;
  let warning = "";

  try {
    await sendInvitationEmail({
      email,
      role,
      temporaryPassword,
      workspaceId,
    });
    emailSent = true;
  } catch (error) {
    warning = getInvitationEmailFailureMessage(error);
    console.error("[users] Invitation email failed", {
      userId: String(user._id),
      email,
      workspaceId,
      message: error?.message || "",
      code: error?.code || "",
      response: error?.response || "",
    });
  }

  res.status(201).json({
    message: emailSent
      ? "User invited successfully and temporary password sent by email"
      : "User account created, but the invitation email was not sent",
    warning: warning || undefined,
    emailSent,
    temporaryPassword: emailSent ? undefined : temporaryPassword,
    invitedUser: serializeInvitedUser(user),
  });
});

const updateUserRole = asyncHandler(async (req, res) => {
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const userId = String(req.params.id || "").trim();
  const role = normalizeRole(req.body.role);

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400);
    throw new Error("Please provide a valid user id");
  }

  if (!role) {
    res.status(400);
    throw new Error("Role is required");
  }

  if (!User.availableRoles.includes(role)) {
    res.status(400);
    throw new Error(`Role must be one of ${User.availableRoles.join(", ")}`);
  }

  const user = await User.findOne({
    _id: userId,
    workspaceId,
  });

  if (!user) {
    res.status(404);
    throw new Error("User not found in this workspace");
  }

  await ensureAdminCanChangeRole({ user, role, workspaceId });

  let warning = "";

  if (user.role !== role) {
    const losesSenderEligibility =
      isEligibleWorkspaceSenderRole(user.role) && !isEligibleWorkspaceSenderRole(role);

    user.role = role;
    await user.save();

    if (losesSenderEligibility) {
      const clearedUserSenderSelections = await clearUserSenderSelectionsForSender({
        workspaceId,
        senderUserId: user._id,
        updatedByUserId: req.user._id,
      });

      const clearedWorkspaceSender = await clearWorkspaceSenderSelection({
        workspaceId,
        userId: req.user._id,
        matchUserId: user._id,
      });

      if ((clearedUserSenderSelections?.modifiedCount || 0) > 0 || clearedWorkspaceSender) {
        warning =
          "Saved sender selections were cleared because this user is no longer eligible.";
      }
    }
  }

  res.status(200).json({
    message: "Role updated successfully",
    warning: warning || undefined,
    user: {
      ...serializeUser(user),
    },
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const userId = String(req.params.id || "").trim();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400);
    throw new Error("Please provide a valid user id");
  }

  const user = await User.findOne({
    _id: userId,
    workspaceId,
  });

  if (!user) {
    res.status(404);
    throw new Error("User not found in this workspace");
  }

  const name = normalizeText(req.body.name);
  const email = normalizeEmail(req.body.email);
  const employeeId = normalizeText(req.body.employeeId).toUpperCase();
  const designation = normalizeText(req.body.designation);
  const role = normalizeRole(req.body.role);

  if (!name || !email || !role) {
    res.status(400);
    throw new Error("Name, email, and role are required");
  }

  if (!emailRegex.test(email)) {
    res.status(400);
    throw new Error("Please provide a valid email address");
  }

  if (!User.availableRoles.includes(role)) {
    res.status(400);
    throw new Error(`Role must be one of ${User.availableRoles.join(", ")}`);
  }

  await ensureAdminCanChangeRole({ user, role, workspaceId });

  const duplicateUser = await User.findOne({
    _id: { $ne: user._id },
    $or: [
      { email },
      ...(employeeId ? [{ employeeId }] : []),
    ],
  })
    .select("_id email employeeId")
    .lean();

  if (duplicateUser?.email === email) {
    res.status(409);
    throw new Error("A user with that email already exists");
  }

  if (employeeId && duplicateUser?.employeeId === employeeId) {
    res.status(409);
    throw new Error("A user with that employee id already exists");
  }

  const previousRole = user.role;

  user.name = name;
  user.email = email;
  user.employeeId = employeeId || undefined;
  user.designation = designation;
  user.role = role;
  await user.save();

  let warning = "";
  const losesSenderEligibility =
    isEligibleWorkspaceSenderRole(previousRole) && !isEligibleWorkspaceSenderRole(role);

  if (losesSenderEligibility) {
    const clearedUserSenderSelections = await clearUserSenderSelectionsForSender({
      workspaceId,
      senderUserId: user._id,
      updatedByUserId: req.user._id,
    });

    const clearedWorkspaceSender = await clearWorkspaceSenderSelection({
      workspaceId,
      userId: req.user._id,
      matchUserId: user._id,
    });

    if ((clearedUserSenderSelections?.modifiedCount || 0) > 0 || clearedWorkspaceSender) {
      warning =
        "Saved sender selections were cleared because this user is no longer eligible.";
    }
  }

  res.status(200).json({
    message: "User updated successfully",
    warning: warning || undefined,
    user: serializeUser(user),
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const userId = String(req.params.id || "").trim();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400);
    throw new Error("Please provide a valid user id");
  }

  if (String(req.user._id) === userId) {
    res.status(400);
    throw new Error("You cannot delete your own account");
  }

  const user = await User.findOne({
    _id: userId,
    workspaceId,
  });

  if (!user) {
    res.status(404);
    throw new Error("User not found in this workspace");
  }

  if (user.role === ROLE_ADMIN) {
    const adminCount = await User.countDocuments({
      workspaceId,
      role: ROLE_ADMIN,
    });

    if (adminCount <= 1) {
      res.status(400);
      throw new Error("At least one admin must remain in the workspace");
    }
  }

  await clearUserSenderSelectionsForSender({
    workspaceId,
    senderUserId: user._id,
    updatedByUserId: req.user._id,
  });
  await clearWorkspaceSenderSelection({
    workspaceId,
    userId: req.user._id,
    matchUserId: user._id,
  });
  await UserEmailConfig.deleteMany({ workspaceId, userId: user._id });
  await TeamMember.deleteMany({ userId: user._id });
  await User.deleteOne({ _id: user._id, workspaceId });

  res.status(200).json({
    message: "User deleted successfully",
    deletedUserId: userId,
  });
});

const importUsers = asyncHandler(async (req, res) => {
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);

  if (!req.file?.buffer?.length) {
    res.status(400);
    throw new Error("Please upload a CSV file");
  }

  const originalName = String(req.file.originalname || "").toLowerCase();

  if (!originalName.endsWith(".csv")) {
    res.status(400);
    throw new Error("Only .csv files are supported");
  }

  let parsedCsv;

  try {
    parsedCsv = await parseUserImportCsv(req.file.buffer);
  } catch (error) {
    res.status(400);
    throw new Error("Unable to parse the CSV file");
  }

  if (!parsedCsv.headers.length) {
    res.status(400);
    throw new Error("The uploaded CSV file is empty");
  }

  if (!parsedCsv.emailKey) {
    res.status(400);
    throw new Error("CSV must include an Email Address or email column");
  }

  if (!parsedCsv.nameKey) {
    res.status(400);
    throw new Error("CSV must include a Full Name or name column");
  }

  if (!parsedCsv.rows.length) {
    res.status(400);
    throw new Error("The uploaded CSV file does not contain any data rows");
  }

  const candidateEmails = Array.from(
    new Set(parsedCsv.rows.map((row) => row.email).filter(Boolean))
  );
  const existingUsers = candidateEmails.length
    ? await User.find({
        email: {
          $in: candidateEmails,
        },
      })
        .select("email")
        .lean()
    : [];
  const existingEmailSet = new Set(
    existingUsers.map((user) => normalizeEmail(user.email))
  );
  const seenEmails = new Set();
  const errors = [];

  const hashedPassword = await bcrypt.hash(DEFAULT_IMPORTED_PASSWORD, 10);
  const usersToCreate = [];

  // Validate row-by-row first so the response can explain exactly what was
  // skipped before we do a single bulk insert for the valid users.
  parsedCsv.rows.forEach((row) => {
    if (row.isEmpty) {
      return;
    }

    if (!row.name) {
      errors.push({
        row: row.row,
        message: "Name is required",
      });
      return;
    }

    if (!row.email) {
      errors.push({
        row: row.row,
        message: "Email is required",
      });
      return;
    }

    if (!emailRegex.test(row.email)) {
      errors.push({
        row: row.row,
        message: "Invalid email format",
      });
      return;
    }

    if (existingEmailSet.has(row.email) || seenEmails.has(row.email)) {
      errors.push({
        row: row.row,
        message: "Duplicate email",
      });
      return;
    }

    seenEmails.add(row.email);
    usersToCreate.push({
      name: row.name,
      email: row.email,
      password: hashedPassword,
      role: DEFAULT_IMPORTED_ROLE,
      workspaceId,
    });
  });

  let successCount = 0;

  if (usersToCreate.length) {
    try {
      const insertedUsers = await User.insertMany(usersToCreate, {
        ordered: false,
      });
      successCount = insertedUsers.length;
    } catch (error) {
      const writeErrors = error.writeErrors || [];
      const duplicateCode = 11000;

      successCount = error.insertedDocs?.length || 0;

      writeErrors.forEach((writeError) => {
        const failedOperation = writeError.err?.op || writeError.err?.insertedDoc || {};
        const failedEmail = normalizeEmail(failedOperation.email);
        const failedRow = parsedCsv.rows.find(
          (row) => !row.isEmpty && normalizeEmail(row.email) === failedEmail
        );

        errors.push({
          row: failedRow?.row || 0,
          message:
            writeError.code === duplicateCode
              ? "Duplicate email"
              : "Unable to create user from this row",
        });
      });

      if (!writeErrors.length) {
        throw error;
      }
    }
  }

  res.status(200).json({
    successCount,
    failedCount: errors.length,
    errors,
    message: "Import completed",
  });
});

module.exports = {
  getManagedUsers,
  inviteUser,
  updateUser,
  updateUserRole,
  deleteUser,
  importUsers,
};
