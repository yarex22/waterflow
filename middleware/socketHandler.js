// socketHandler.js
const socketIO = require("socket.io");

module.exports = (server) => {
  const io = socketIO(server);

  io.on("connection", (socket) => {
    console.log("New user connected");

    // Handle chat message event
    socket.on("chat message", (message) => {
      console.log("Message received:", message);
      // Broadcast the message to all connected clients
      io.emit("chat message", message);
    });

    // Handle socket disconnection
    socket.on("disconnect", () => {
      console.log("User disconnected");
    });

    // Return the io instance
    return io;
  });
};
