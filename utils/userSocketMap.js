// userSocketMap.js
const userSocketMap = {};

function addUserSocket(userId, socket) {
  userSocketMap[userId] = socket;
}

function getUserSocket(userId) {
  return userSocketMap[userId];
}

function removeUserSocket(userId) {
  delete userSocketMap[userId];
}

module.exports = {
  addUserSocket,
  getUserSocket,
  removeUserSocket,
};
