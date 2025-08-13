const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }], // Array of Project references
  projectAssignments: [{
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    assignedAt: { type: Date, default: Date.now }
  }],
  canAccessFirmware: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema); 