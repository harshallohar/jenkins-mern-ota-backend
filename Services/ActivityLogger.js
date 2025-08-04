const RecentActivity = require('../Models/RecentActivityModel');

class ActivityLogger {
  // Log OTA Update activities
  static async logOTAUpdate(userId, deviceId, status, version, details = {}) {
    const activityType = status === 'Success' ? 'OTA_UPDATE_SUCCESS' : 'OTA_UPDATE_FAILED';
    const severity = status === 'Success' ? 'success' : 'error';
    
    await this.createActivity(userId, {
      activityType,
      title: `OTA Update ${status}`,
      description: `Device ${deviceId} ${status.toLowerCase()} update to version ${version}`,
      severity,
      details: {
        deviceId,
        status,
        version,
        ...details
      }
    });
  }

  // Log Firmware Upload
  static async logFirmwareUpload(userId, deviceId, version, filename, details = {}) {
    await this.createActivity(userId, {
      activityType: 'FIRMWARE_UPLOADED',
      title: 'Firmware Uploaded',
      description: `Firmware version ${version} uploaded for device ${deviceId}`,
      severity: 'success',
      details: {
        deviceId,
        version,
        filename,
        ...details
      }
    });
  }

  // Log Device operations
  static async logDeviceAdded(userId, deviceId, deviceName, details = {}) {
    await this.createActivity(userId, {
      activityType: 'DEVICE_ADDED',
      title: 'Device Added',
      description: `Device "${deviceName}" (${deviceId}) added to system`,
      severity: 'success',
      details: {
        deviceId,
        deviceName,
        ...details
      }
    });
  }

  static async logDeviceRemoved(userId, deviceId, deviceName, details = {}) {
    await this.createActivity(userId, {
      activityType: 'DEVICE_REMOVED',
      title: 'Device Removed',
      description: `Device "${deviceName}" (${deviceId}) removed from system`,
      severity: 'warning',
      details: {
        deviceId,
        deviceName,
        ...details
      }
    });
  }

  // Log User operations
  static async logUserAdded(userId, newUserId, userName, details = {}) {
    await this.createActivity(userId, {
      activityType: 'USER_ADDED',
      title: 'User Added',
      description: `User "${userName}" added to system`,
      severity: 'success',
      details: {
        newUserId,
        userName,
        ...details
      }
    });
  }

  static async logUserUpdated(userId, updatedUserId, userName, details = {}) {
    await this.createActivity(userId, {
      activityType: 'USER_UPDATED',
      title: 'User Updated',
      description: `User "${userName}" updated in system`,
      severity: 'info',
      details: {
        updatedUserId,
        userName,
        ...details
      }
    });
  }

  static async logUserRemoved(userId, removedUserId, userName, details = {}) {
    await this.createActivity(userId, {
      activityType: 'USER_REMOVED',
      title: 'User Removed',
      description: `User "${userName}" removed from system`,
      severity: 'warning',
      details: {
        removedUserId,
        userName,
        ...details
      }
    });
  }

  // Log Project operations
  static async logProjectCreated(userId, projectId, projectName, details = {}) {
    await this.createActivity(userId, {
      activityType: 'PROJECT_CREATED',
      title: 'Project Created',
      description: `Project "${projectName}" created`,
      severity: 'success',
      details: {
        projectId,
        projectName,
        ...details
      }
    });
  }

  static async logProjectUpdated(userId, projectId, projectName, details = {}) {
    await this.createActivity(userId, {
      activityType: 'PROJECT_UPDATED',
      title: 'Project Updated',
      description: `Project "${projectName}" updated`,
      severity: 'info',
      details: {
        projectId,
        projectName,
        ...details
      }
    });
  }

  // Log Device assignment operations
  static async logDeviceAssigned(userId, deviceId, deviceName, projectName, details = {}) {
    await this.createActivity(userId, {
      activityType: 'DEVICE_ASSIGNED',
      title: 'Device Assigned',
      description: `Device "${deviceName}" assigned to project "${projectName}"`,
      severity: 'success',
      details: {
        deviceId,
        deviceName,
        projectName,
        ...details
      }
    });
  }

  static async logDeviceUnassigned(userId, deviceId, deviceName, projectName, details = {}) {
    await this.createActivity(userId, {
      activityType: 'DEVICE_UNASSIGNED',
      title: 'Device Unassigned',
      description: `Device "${deviceName}" unassigned from project "${projectName}"`,
      severity: 'warning',
      details: {
        deviceId,
        deviceName,
        projectName,
        ...details
      }
    });
  }

  // Log Login/Logout
  static async logLogin(userId, details = {}) {
    await this.createActivity(userId, {
      activityType: 'LOGIN',
      title: 'User Login',
      description: 'User logged in successfully',
      severity: 'info',
      details: {
        loginTime: new Date(),
        ...details
      }
    });
  }

  static async logLogout(userId, details = {}) {
    await this.createActivity(userId, {
      activityType: 'LOGOUT',
      title: 'User Logout',
      description: 'User logged out',
      severity: 'info',
      details: {
        logoutTime: new Date(),
        ...details
      }
    });
  }

  // Log Export operations
  static async logExportData(userId, exportType, fileName, details = {}) {
    await this.createActivity(userId, {
      activityType: 'EXPORT_DATA',
      title: 'Data Exported',
      description: `${exportType} data exported to ${fileName}`,
      severity: 'info',
      details: {
        exportType,
        fileName,
        ...details
      }
    });
  }

  // Log Bulk operations
  static async logBulkOperation(userId, operationType, itemCount, details = {}) {
    await this.createActivity(userId, {
      activityType: 'BULK_OPERATION',
      title: 'Bulk Operation',
      description: `${operationType} performed on ${itemCount} items`,
      severity: 'info',
      details: {
        operationType,
        itemCount,
        ...details
      }
    });
  }

  // Generic activity creation method
  static async createActivity(userId, activityData) {
    try {
      const activity = new RecentActivity({
        userId,
        ...activityData
      });
      
      await activity.save();
      return activity;
    } catch (error) {
      console.error('Error creating activity:', error);
      // Don't throw error to avoid breaking main functionality
    }
  }

  // Generic log activity method for StatusManagement
  static async logActivity(activityData) {
    try {
      const activity = new RecentActivity({
        ...activityData
      });
      
      await activity.save();
      return activity;
    } catch (error) {
      console.error('Error creating activity:', error);
      // Don't throw error to avoid breaking main functionality
    }
  }

  // Batch create activities
  static async createBatchActivities(userId, activitiesData) {
    try {
      const activities = activitiesData.map(data => ({
        userId,
        ...data
      }));
      
      await RecentActivity.insertMany(activities);
    } catch (error) {
      console.error('Error creating batch activities:', error);
    }
  }
}

module.exports = ActivityLogger; 