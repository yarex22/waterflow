const ChatMessage = require("../models/chatMessageModel");
const asyncHandler = require("../middleware/asyncHandler");
const userSocketMap = require("../utils/userSocketMap");

exports.saveChatMessage = asyncHandler(async (req, res) => {
  const { text, receiverAvatar, receiverName, receiverId } = req.body;

  console.log("body: ", req.body)
  const senderId = req.user.id;
  const senderName = req.user.firstName;

  const senderAvatar = req.file?.path;
console.log("avatar", senderAvatar)
  const newChatMessage = new ChatMessage({
    text,
    senderId,
    senderName,
    senderAvatar,
    receiverAvatar,
    receiverId,
    receiverName,
  });


  try {
    const savedMessage = await newChatMessage.save();

    const io = req.app.locals.io; // Get the Socket.IO instance
    
    // Emit the saved message to all connected clients using Socket.IO
    const messageToEmit = JSON.stringify(savedMessage);
    io.emit('chat message', messageToEmit); // Emit chat message to all clients
    
     // Emit the notification to the specific receiver's socket with the message text
     const receiverSocket = userSocketMap.getUserSocket(receiverId);
     if (receiverSocket) {
       receiverSocket.emit('notification', `${text}`);
     }
    
    res.status(201).json(savedMessage);
  } catch (err) {
    console.error("Error saving chat message:", err);
    res.status(500).json({ error: "Error saving chat message" });
  }
});


exports.getChatMessages = asyncHandler(async (req, res) => {
  try {
    const { senderId, receiverId } = req.query;

    // Fetch all chat messages between the sender and receiver from the database
    const chatMessages = await ChatMessage.find({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    }).populate({
      path: 'senderId receiverId',
      select: 'firstName lastName email contact1 contact2 address avatar',
    });

    // Send the messages as a response
    res.status(200).json(chatMessages);
  } catch (err) {
    console.error("Error fetching chat messages:", err);
    res.status(500).json({ error: "Error fetching chat messages" });
  }
});

exports.deleteChatMessage = asyncHandler(async (req, res) => {
  const messageId = req.params.id;

  try {
    // Find the chat message by ID and delete it
    const deletedMessage = await ChatMessage.findByIdAndDelete(messageId);

    if (!deletedMessage) {
      return res.status(404).json({ error: "Chat message not found" });
    }

    // Emit an event indicating that the message was deleted
    const io = req.app.locals.io; // Get the Socket.IO instance
    io.emit('chat message deleted', messageId);

    res.status(200).json({ message: "Chat message deleted successfully" });
  } catch (err) {
    console.error("Error deleting chat message:", err);
    res.status(500).json({ error: "Error deleting chat message" });
  }
});

exports.updateChatMessage = asyncHandler(async (req, res) => {
  const messageId = req.params.id;
  const { text } = req.body;

  try {
    // Find the chat message by ID and update its text
    const updatedMessage = await ChatMessage.findByIdAndUpdate(
      messageId,
      { text },
      { new: true }
    );

    if (!updatedMessage) {
      return res.status(404).json({ error: "Chat message not found" });
    }

    // Emit an event indicating that the message was updated
    const io = req.app.locals.io; // Get the Socket.IO instance
    io.emit('chat message updated', updatedMessage);

    res.status(200).json(updatedMessage);
  } catch (err) {
    console.error("Error updating chat message:", err);
    res.status(500).json({ error: "Error updating chat message" });
  }
});


//  // Find the Socket associated with the receiver's user ID
//  const receiverSocket = io.sockets.connected[receiverId];
    
//  if (receiverSocket) {
//    // Emit the notification to the receiver's Socket
//    receiverSocket.emit('notification', JSON.stringify(savedMessage));
//  }