const mongoose = require('mongoose');

const OTAUpdateSchema = new mongoose.Schema({
  pic_id: { 
    type: String, 
    required: true 
  },
  deviceId: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    required: true 
  },
  previousVersion: { 
    type: String, 
    required: true 
  },
  updatedVersion: { 
    type: String, 
    required: true 
  },
  reprogramming: {
    type: Boolean,
    default: false
  },
  recovered: {
    type: Boolean,
    default: true
  },
  statusMessage: { 
    type: String 
  },
  badge: { 
    type: String, 
    enum: ['success', 'failure', 'other'], 
    default: 'other' 
  },
  color: { 
    type: String 
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Index for efficient queries - using timestamp for uniqueness
OTAUpdateSchema.index({ pic_id: 1, deviceId: 1, timestamp: 1 }, { unique: true });
OTAUpdateSchema.index({ deviceId: 1, createdAt: -1 });
OTAUpdateSchema.index({ timestamp: -1 });

module.exports = mongoose.model('OTAUpdate', OTAUpdateSchema); 