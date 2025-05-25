const express = require("express");
const router = express.Router();
const { saveChatMessage, getChatMessages,deleteChatMessage,updateChatMessage } = require("../controllers/chatMessageController");
const { isAuthenticated } = require("../middleware/auth");
const upload = require("../middleware/upload");

// Use the attachIoToMiddleware function to pass the io instance
router.post("/chat/message",upload.single("senderAvatar"), isAuthenticated, saveChatMessage);

// ... (other routes)

// @auth chat
// router.post(
//   "/chat/message",
//   isAuthenticated,
//   saveChatMessage
// );
router.get("/chat/getmessages", isAuthenticated, getChatMessages);
router.delete("/chat/message/:id", isAuthenticated, deleteChatMessage);
router.put("/chat/message/:id", isAuthenticated, updateChatMessage);

module.exports = router;
