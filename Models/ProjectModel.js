const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  projectName: { type: String, required: true },
  projectDescription: { type: String },
  devices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' }] // Array of assigned devices
});

module.exports = mongoose.model('Project', ProjectSchema); 