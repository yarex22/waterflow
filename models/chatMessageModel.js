const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

// Define the Mongoose schema for chat messages
const chatMessageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: false,
  },
  senderId: {
    type: ObjectId,
    ref: "User",
    required: true,
  },
  senderName: {
    type: String,
    required: false,
  },
  senderAvatar: {
    type: String,
    required: false,
  },
  receiverId: {
    type: ObjectId,
    ref: "User",
    required: true,
  },
  receiverName: {
    type: String,
    required: false,
  },
  receiverAvatar: {
    type: String,
    required: false,
  },

  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Create the Mongoose model using the schema
const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

module.exports = ChatMessage;
