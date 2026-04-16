const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
    chatId: { type: String, required: true }, // Can be @username or -100xxx
    inviteLink: { type: String, required: true },
    type: { type: String, enum: ['global', 'request', 'external'], default: 'global' },
    name: String,
    addedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Channel', channelSchema);
