const mongoose = require('mongoose');

const RecentActivitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // For faster queries by user
  },
  activityType: {
    type: String,
    required: true,
    enum: [
      'OTA_UPDATE_SUCCESS',
      'OTA_UPDATE_FAILED', 
      'FIRMWARE_UPLOADED',
      'DEVICE_ADDED',
      'DEVICE_REMOVED',
      'USER_ADDED',
      'USER_UPDATED',
      'USER_REMOVED',
      'PROJECT_CREATED',
      'PROJECT_UPDATED',
      'DEVICE_ASSIGNED',
      'DEVICE_UNASSIGNED',
      'LOGIN',
      'LOGOUT',
      'EXPORT_DATA',
      'BULK_OPERATION'
    ]
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed, // Flexible object for additional data
    default: {}
  },
  severity: {
    type: String,
    enum: ['info', 'success', 'warning', 'error'],
    default: 'info'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true // For sorting by time
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound index for efficient user-specific queries with time sorting
RecentActivitySchema.index({ userId: 1, timestamp: -1 });

// Method to get activities for a user with pagination
RecentActivitySchema.statics.getUserActivities = function(userId, limit = 50, skip = 0) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);
};

// Method to clear all activities for a user
RecentActivitySchema.statics.clearUserActivities = function(userId) {
  return this.deleteMany({ userId });
};

// Method to mark activities as read
RecentActivitySchema.statics.markAsRead = function(userId, activityIds) {
  return this.updateMany(
    { userId, _id: { $in: activityIds } },
    { $set: { isRead: true } }
  );
};

// Method to get unread count for a user
RecentActivitySchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

module.exports = mongoose.model('RecentActivity', RecentActivitySchema); 