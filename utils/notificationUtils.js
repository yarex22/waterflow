async function sendNotification(senderId, receiverId, message) {
    try {
      const io = require("socket.io"); // Import the socket.io module
  
      // Emit the notification to the specific user socket
      const recipientSocket = usersOnline.get(receiverId);
      if (recipientSocket) {
        recipientSocket.emit("notification", { message });
      }
  
      console.log("Notification sent successfully!");
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  }
  
  module.exports = {
    sendNotification,
  };
  