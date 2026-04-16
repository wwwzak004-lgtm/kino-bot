const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    fileId: { type: String, required: true },
    caption: String,
    uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Movie', movieSchema);
