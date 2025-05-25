const userSocketMap = require("../utils/userSocketMap");

module.exports = (io) => {
  const usersOnline = new Map(); // Map to store online users
  const unreadMessageCounts = new Map(); // Map to store unread message counts

  // Broadcast user status (online/offline) to all connected clients
  function broadcastUserStatus(userId, isOnline) {
    io.emit("userStatus", { userId, isOnline });
  }

  io.on("connection", (socket) => {
    console.log("WebSocket connected");

    let userId; // Store the user ID associated with the socket

    socket.on("user-online", (incomingUserId) => {
      userId = incomingUserId;
      
      usersOnline.set(userId, socket);
      unreadMessageCounts.set(userId, 0); // Initialize unread count
      broadcastUserStatus(userId, true);
      userSocketMap.addUserSocket(userId, socket); // Store the user's socket
      console.log(`User ${userId} connected and socket stored`);
    });

    // Asynchronous function to handle chat messages
    async function handleChatMessage(message) {
      // Broadcast the message to all connected clients
      io.emit("chat message", message);


     // Emit notification event to the specific receiver's socket
     const receiverId = message.receiverId;
     setTimeout(() => {
       const receiverSocket = userSocketMap.getUserSocket(receiverId);
    //   console.log("receiverSocket: ",receiverSocket)
       if (receiverSocket) {
         receiverSocket.emit("notification", "You have a new message!");
        //  console.log(`Notification sent to user ${receiverId}`);
       } else {
        //  console.log("Receiver socket not found for user ID:", receiverId);
       }
     }, 100); // Delay of 100 milliseconds
    }

    // Listen for the 'chat message' event
    socket.on("chat message", handleChatMessage);

    // Other code ...

    socket.on("chat message read", (receiverId) => {
      // Handle chat message read event
      resetUnreadCount(receiverId);
    });

    socket.on("disconnect", () => {
      console.log("WebSocket disconnected");
      if (userId) {
        usersOnline.delete(userId);
        unreadMessageCounts.delete(userId);
        broadcastUserStatus(userId, false);
        userSocketMap.removeUserSocket(userId); // Remove user's socket on disconnect
      }
    });
  });
};
