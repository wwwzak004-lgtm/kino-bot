const mongoose = require('mongoose');

const joinRequestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    chatId: { type: String, required: true },
    requestedAt: { type: Date, default: Date.now }
});

// User va chat kombinatsiyasi uchun index
joinRequestSchema.index({ userId: 1, chatId: 1 }, { unique: true });

module.exports = mongoose.model('JoinRequest', joinRequestSchema);
