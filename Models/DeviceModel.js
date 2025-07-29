const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  deviceId: { type: String, required: true, unique: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, // Reference to Project
  dateCreated: { type: Date, default: Date.now },
  dateAssigned: { type: Date } // Date when device was assigned to a project
});

module.exports = mongoose.model('Device', DeviceSchema); 