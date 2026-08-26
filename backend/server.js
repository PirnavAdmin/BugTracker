const path = require("path");
require("./config/env");
require("./config/cashfree");
const redisClient = require("./utils/redis");

const cors = require("cors");
const express = require("express");
const http = require("http");
const activityRoutes = require("./routes/activityRoutes");
const aiRoutes = require("./routes/aiRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const backlogRoutes = require("./routes/backlogRoutes");
const bugRoutes = require("./routes/bugRoutes");
const chatRoutes = require("./routes/chat.routes");
const connectDB = require("./config/db");
const epicRoutes = require("./routes/epicRoutes");
const { errorHandler, notFound } = require("./middleware/errorMiddleware");
const authRoutes = require("./routes/authRoutes");
const commentRoutes = require("./routes/commentRoutes");
const issueRoutes = require("./routes/issueRoutes");
const platformRoutes = require("./routes/platformRoutes");
const projectRoutes = require("./routes/projectRoutes");
const reportRoutes = require("./routes/reportRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const sprintRoutes = require("./routes/sprintRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const taskRoutes = require("./routes/taskRoutes");
const teamRoutes = require("./routes/teamRoutes");
const testRoutes = require("./routes/testRoutes");
const userRoutes = require("./routes/userRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const billingRoutes = require("./routes/billingRoutes");
const cashfreeBillingRoutes = require("./routes/cashfreeBillingRoutes");
const { webhook: razorpayBillingWebhook } = require("./controllers/billingController");
const { webhook: cashfreeBillingWebhook } = require("./controllers/cashfreeBillingController");
const workspaceRoutes = require("./routes/workspaceRoutes");
const { startSprintNotificationWorker } = require("./services/sprintNotificationQueue");
const { setupChatSocket } = require("./socket");
const { ensureDefaultUser } = require("./utils/defaultUser");
const { ensureInitialPlatformAdmin } = require("./utils/platformBootstrap");
const syncProjectEpics = require("./utils/syncProjectEpics");
const syncIssueStatuses = require("./utils/syncIssueStatuses");
const syncIssueDisplayIds = require("./utils/syncIssueDisplayIds");
const syncWorkspaceScopes = require("./utils/syncWorkspaceScopes");

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

app.disable("x-powered-by");

app.use(cors());
// Razorpay signs the exact bytes sent. This route intentionally precedes JSON parsing.
app.post("/api/billing/webhooks/razorpay", express.raw({ type: "application/json", limit: "2mb" }), razorpayBillingWebhook);
// Cashfree signs the timestamp concatenated with the exact, unparsed request bytes.
app.post("/api/billing/cashfree/webhook", express.raw({ type: "application/json", limit: "2mb" }), cashfreeBillingWebhook);
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// Protect issue attachments from direct access - must use API endpoint
const blockIssueAttachmentDirectAccess = (req, res) => {
  res.status(403).json({
    message: "Direct access to issue attachments is not allowed. Use the API endpoint instead.",
  });
};

app.use("/uploads/issue-attachments", blockIssueAttachmentDirectAccess);
app.use("/api/uploads/issue-attachments", blockIssueAttachmentDirectAccess);

// Allow other uploads (e.g., chat attachments) for now
app.use("/uploads", express.static(path.resolve(__dirname, "uploads")));
app.use("/api/uploads", express.static(path.resolve(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.status(200).json({
    message: "Jira Clone API is running",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "bug-tracking-backend",
    uptime: process.uptime(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/bugs", bugRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/backlog", backlogRoutes);
app.use("/api/epics", epicRoutes);
app.use("/api/sprints", sprintRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/billing/cashfree", cashfreeBillingRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/", testRoutes);

app.use(notFound);
app.use(errorHandler);

const startServer = async () => {
  await connectDB();
  await redisClient.connectRedis();
  await ensureDefaultUser();
  await ensureInitialPlatformAdmin();
  await syncIssueStatuses();
  await syncWorkspaceScopes();
  await syncProjectEpics();
  await syncIssueDisplayIds();
  startSprintNotificationWorker();

  setupChatSocket(server);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
