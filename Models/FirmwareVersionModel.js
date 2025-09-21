// Models/FirmwareVersionModel.js
const mongoose = require("mongoose");

const FirmwareVersionSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  version: { type: String, required: true },
  uploadedDate: { type: Date, default: Date.now },
});

FirmwareVersionSchema.index({ deviceId: 1, version: 1 }, { unique: true }); // prevent duplicates

module.exports = mongoose.model("FirmwareVersion", FirmwareVersionSchema);
