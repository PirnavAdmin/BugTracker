const express = require("express");
const {
  addConversationParticipants,
  createConversation,
  deleteConversation,
  deleteMeeting,
  createMessage,
  getCallLogs,
  getAllMeetings,
  getConversationById,
  getConversations,
  getMeetings,
  getMessages,
  removeConversationParticipant,
  scheduleMeeting,
  searchUsers,
  updateMeeting,
  uploadChatAttachment,
  uploadChatAttachmentMiddleware,
} = require("../controllers/chat.controller");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/conversations", protect, getConversations);
router.post("/conversations", protect, createConversation);
router.post("/conversations/:id/participants", protect, addConversationParticipants);
router.delete("/conversations/:id/participants/:userId", protect, removeConversationParticipant);
router.delete("/conversations/:id", protect, deleteConversation);
router.get("/conversation/:id", protect, getConversationById);
router.get("/messages/:conversationId", protect, getMessages);
router.post("/messages", protect, createMessage);
router.get("/calls", protect, getCallLogs);
router.get("/meetings", protect, getAllMeetings);
router.get("/conversations/:conversationId/meetings", protect, getMeetings);
router.post("/conversations/:conversationId/meetings", protect, scheduleMeeting);
router.patch("/meetings/:meetingId", protect, updateMeeting);
router.delete("/meetings/:meetingId", protect, deleteMeeting);
router.post("/attachments", protect, uploadChatAttachmentMiddleware, uploadChatAttachment);
router.get("/users/search", protect, searchUsers);

module.exports = router;
