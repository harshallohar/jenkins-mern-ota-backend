const mongoose = require('mongoose');

const StatusCodeSchema = new mongoose.Schema({
  code: { type: Number, required: true },
  message: { type: String, required: true },
  color: { type: String, default: '#6B7280' }, // Default gray color
  badge: { 
    type: String, 
    enum: ['success', 'failure', 'other'], 
    default: 'other' 
  }
});

const StatusManagementSchema = new mongoose.Schema({
  deviceId: { 
    type: String, 
    required: true, 
    ref: 'Device' 
  },
  deviceName: { 
    type: String, 
    required: true 
  },
  statusCodes: [StatusCodeSchema],
  isBasedOnOtherDevice: { 
    type: Boolean, 
    default: false 
  },
  baseDeviceId: { 
    type: String, 
    ref: 'Device' 
  },
  baseDeviceName: { 
    type: String 
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Update the updatedAt field before saving
StatusManagementSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('StatusManagement', StatusManagementSchema); 