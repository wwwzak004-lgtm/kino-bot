const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    addedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Admin', adminSchema);
