const mongoose = require('mongoose');

const ReadingHistorySchema = new mongoose.Schema({
  readingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reading',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changeType: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE'],
    required: true
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ReadingHistory', ReadingHistorySchema); 