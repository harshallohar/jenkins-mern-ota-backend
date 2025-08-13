const mongoose = require('mongoose');

const DashboardStatsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  deviceName: {
    type: String,
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  projectName: {
    type: String
  },
  // Track the latest status for each device per day
  latestStatus: {
    code: { type: Number, required: true },
    message: { type: String, required: true },
    badge: { 
      type: String, 
      enum: ['success', 'failure', 'other'], 
      required: true 
    },
    timestamp: { type: Date, default: Date.now }
  },
  // Track all status changes for the day (for history)
  statusHistory: [{
    code: { type: Number, required: true },
    message: { type: String, required: true },
    badge: { 
      type: String, 
      enum: ['success', 'failure', 'other'], 
      required: true 
    },
    timestamp: { type: Date, default: Date.now }
  }],
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
DashboardStatsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compound index for efficient queries
DashboardStatsSchema.index({ date: 1, deviceId: 1 }, { unique: true });

// Static method to get daily statistics
DashboardStatsSchema.statics.getDailyStats = async function(date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const stats = await this.find({
    date: { $gte: startOfDay, $lte: endOfDay }
  });

  const successCount = stats.filter(stat => stat.latestStatus.badge === 'success').length;
  const failureCount = stats.filter(stat => stat.latestStatus.badge === 'failure').length;
  const otherCount = stats.filter(stat => stat.latestStatus.badge === 'other').length;

  return {
    success: successCount,
    failure: failureCount,
    other: otherCount,
    total: stats.length
  };
};

// Static method to update device status
DashboardStatsSchema.statics.updateDeviceStatus = async function(deviceId, deviceName, projectId, projectName, statusCode, statusMessage, statusBadge) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const statusUpdate = {
    code: statusCode,
    message: statusMessage,
    badge: statusBadge,
    timestamp: new Date()
  };

  // Try to find existing record for today
  let stats = await this.findOne({
    date: today,
    deviceId: deviceId
  });

  if (stats) {
    // Update existing record
    stats.latestStatus = statusUpdate;
    stats.statusHistory.push(statusUpdate);
    stats.deviceName = deviceName;
    stats.projectId = projectId;
    stats.projectName = projectName;
  } else {
    // Create new record
    stats = new this({
      date: today,
      deviceId: deviceId,
      deviceName: deviceName,
      projectId: projectId,
      projectName: projectName,
      latestStatus: statusUpdate,
      statusHistory: [statusUpdate]
    });
  }

  await stats.save();
  return stats;
};

module.exports = mongoose.model('DashboardStats', DashboardStatsSchema);
