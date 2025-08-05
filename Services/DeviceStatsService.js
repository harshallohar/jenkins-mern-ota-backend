const Device = require('../Models/DeviceModel');
const OTAUpdate = require('../Models/OTAUpdateModel');

class DeviceStatsService {
  // Update device statistics when OTA update is added/updated
  static async updateDeviceStats(deviceId) {
    try {
      // Get all OTA updates for this device
      const otaUpdates = await OTAUpdate.find({ deviceId });
      
      // Calculate final outcomes (by PIC)
      const totalPics = otaUpdates.length;
      const successfulPics = otaUpdates.filter(update => update.finalStatus === 'success').length;
      const failedPics = otaUpdates.filter(update => update.finalStatus === 'failed').length;
      const pendingPics = otaUpdates.filter(update => update.finalStatus === 'pending').length;
      
      // Calculate attempt-level statistics
      let totalAttempts = 0;
      let successfulAttempts = 0;
      let failedAttempts = 0;
      
      otaUpdates.forEach(update => {
        totalAttempts += update.totalAttempts || 0;
        successfulAttempts += update.successAttempts || 0;
        failedAttempts += update.failureAttempts || 0;
      });
      
      // Calculate derived metrics
      const averageAttemptsPerPic = totalPics > 0 ? (totalAttempts / totalPics) : 0;
      const successRateByPics = totalPics > 0 ? (successfulPics / totalPics) * 100 : 0;
      const successRateByAttempts = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;
      
      const stats = {
        // Final outcomes (by PIC)
        totalPics,
        successfulPics,
        failedPics,
        pendingPics,
        
        // Attempt-level statistics
        totalAttempts,
        successfulAttempts,
        failedAttempts,
        
        // Calculated metrics
        averageAttemptsPerPic: Math.round(averageAttemptsPerPic * 100) / 100,
        successRateByPics: Math.round(successRateByPics * 100) / 100,
        successRateByAttempts: Math.round(successRateByAttempts * 100) / 100,
        
        lastUpdated: new Date()
      };
      
      // Update device with new statistics
      await Device.findOneAndUpdate(
        { deviceId },
        { 
          $set: { 
            otaStats: stats 
          }
        },
        { new: true }
      );
      
      console.log(`Updated OTA stats for device ${deviceId}:`, stats);
      return stats;
    } catch (error) {
      console.error('Error updating device stats:', error);
      throw error;
    }
  }
  
  // Get device statistics
  static async getDeviceStats(deviceId) {
    try {
      const device = await Device.findOne({ deviceId });
      return device ? device.otaStats : null;
    } catch (error) {
      console.error('Error getting device stats:', error);
      throw error;
    }
  }
  
  // Get all devices with their OTA statistics
  static async getAllDevicesWithStats() {
    try {
      const devices = await Device.find().sort({ 'otaStats.lastUpdated': -1 });
      return devices;
    } catch (error) {
      console.error('Error getting all devices with stats:', error);
      throw error;
    }
  }
  
  // Update statistics for all devices
  static async updateAllDeviceStats() {
    try {
      const devices = await Device.find();
      const results = [];
      
      for (const device of devices) {
        try {
          const stats = await this.updateDeviceStats(device.deviceId);
          results.push({ deviceId: device.deviceId, success: true, stats });
        } catch (error) {
          results.push({ deviceId: device.deviceId, success: false, error: error.message });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error updating all device stats:', error);
      throw error;
    }
  }
  
  // Get summary statistics across all devices
  static async getSummaryStats() {
    try {
      const devices = await Device.find();
      
      const summary = {
        totalDevices: devices.length,
        
        // Final outcomes (by PIC)
        totalPics: 0,
        totalSuccessfulPics: 0,
        totalFailedPics: 0,
        totalPendingPics: 0,
        
        // Attempt-level statistics
        totalAttempts: 0,
        totalSuccessfulAttempts: 0,
        totalFailedAttempts: 0,
        
        // Calculated metrics
        averageAttemptsPerPic: 0,
        overallSuccessRateByPics: 0,
        overallSuccessRateByAttempts: 0,
        
        // Device performance distribution
        devicePerformance: {
          highPerformers: 0,    // >90% success rate
          mediumPerformers: 0,  // 70-90% success rate
          lowPerformers: 0,     // <70% success rate
          unreliable: 0         // >3 avg attempts per PIC
        }
      };
      
      devices.forEach(device => {
        if (device.otaStats) {
          // Sum up all statistics
          summary.totalPics += device.otaStats.totalPics || 0;
          summary.totalSuccessfulPics += device.otaStats.successfulPics || 0;
          summary.totalFailedPics += device.otaStats.failedPics || 0;
          summary.totalPendingPics += device.otaStats.pendingPics || 0;
          
          summary.totalAttempts += device.otaStats.totalAttempts || 0;
          summary.totalSuccessfulAttempts += device.otaStats.successfulAttempts || 0;
          summary.totalFailedAttempts += device.otaStats.failedAttempts || 0;
          
          // Categorize device performance
          const successRate = device.otaStats.successRateByPics || 0;
          const avgAttempts = device.otaStats.averageAttemptsPerPic || 0;
          
          if (successRate > 90) {
            summary.devicePerformance.highPerformers++;
          } else if (successRate >= 70) {
            summary.devicePerformance.mediumPerformers++;
          } else {
            summary.devicePerformance.lowPerformers++;
          }
          
          if (avgAttempts > 3) {
            summary.devicePerformance.unreliable++;
          }
        }
      });
      
      // Calculate overall metrics
      if (summary.totalPics > 0) {
        summary.overallSuccessRateByPics = (summary.totalSuccessfulPics / summary.totalPics) * 100;
        summary.averageAttemptsPerPic = summary.totalAttempts / summary.totalPics;
      }
      
      if (summary.totalAttempts > 0) {
        summary.overallSuccessRateByAttempts = (summary.totalSuccessfulAttempts / summary.totalAttempts) * 100;
      }
      
      // Round the calculated values
      summary.overallSuccessRateByPics = Math.round(summary.overallSuccessRateByPics * 100) / 100;
      summary.overallSuccessRateByAttempts = Math.round(summary.overallSuccessRateByAttempts * 100) / 100;
      summary.averageAttemptsPerPic = Math.round(summary.averageAttemptsPerPic * 100) / 100;
      
      return summary;
    } catch (error) {
      console.error('Error getting summary stats:', error);
      throw error;
    }
  }
  
  // Get detailed statistics for a specific device
  static async getDetailedDeviceStats(deviceId) {
    try {
      const device = await Device.findOne({ deviceId });
      if (!device) {
        return null;
      }
      
      // Get all OTA updates for detailed analysis
      const otaUpdates = await OTAUpdate.find({ deviceId }).sort({ lastUpdated: -1 });
      
      const detailedStats = {
        device: {
          name: device.name,
          deviceId: device.deviceId,
          project: device.project
        },
        summary: device.otaStats,
        detailedAnalysis: {
          byFirmwareVersion: {},
          byMonth: {},
          recentPerformance: {
            last7Days: { totalPics: 0, successfulPics: 0, failedPics: 0 },
            last30Days: { totalPics: 0, successfulPics: 0, failedPics: 0 }
          }
        }
      };
      
      // Group by firmware version
      otaUpdates.forEach(update => {
        const version = update.updatedVersion;
        if (!detailedStats.detailedAnalysis.byFirmwareVersion[version]) {
          detailedStats.detailedAnalysis.byFirmwareVersion[version] = {
            totalPics: 0,
            successfulPics: 0,
            failedPics: 0,
            totalAttempts: 0,
            successfulAttempts: 0,
            failedAttempts: 0
          };
        }
        
        const versionStats = detailedStats.detailedAnalysis.byFirmwareVersion[version];
        versionStats.totalPics++;
        versionStats.totalAttempts += update.totalAttempts || 0;
        versionStats.successfulAttempts += update.successAttempts || 0;
        versionStats.failedAttempts += update.failureAttempts || 0;
        
        if (update.finalStatus === 'success') {
          versionStats.successfulPics++;
        } else if (update.finalStatus === 'failed') {
          versionStats.failedPics++;
        }
      });
      
      // Calculate success rates for each version
      Object.keys(detailedStats.detailedAnalysis.byFirmwareVersion).forEach(version => {
        const stats = detailedStats.detailedAnalysis.byFirmwareVersion[version];
        stats.successRateByPics = stats.totalPics > 0 ? (stats.successfulPics / stats.totalPics) * 100 : 0;
        stats.successRateByAttempts = stats.totalAttempts > 0 ? (stats.successfulAttempts / stats.totalAttempts) * 100 : 0;
      });
      
      return detailedStats;
    } catch (error) {
      console.error('Error getting detailed device stats:', error);
      throw error;
    }
  }
  
  // Get device-level statistics for dashboard (devices with success/failure experiences)
  static async getDashboardDeviceStats(startDate, endDate, projectId = null) {
    try {
      // Get all OTA updates within the date range
      const dateFilter = {
        lastUpdated: {
          $gte: startDate,
          $lte: endDate
        }
      };
      
      const otaUpdates = await OTAUpdate.find(dateFilter);
      
      // Get all devices (filtered by project if specified)
      let deviceFilter = {};
      if (projectId) {
        deviceFilter.project = projectId;
      }
      const devices = await Device.find(deviceFilter);
      
      // Create a map to track device experiences
      const deviceExperiences = new Map();
      
      // Initialize all devices with no experiences
      devices.forEach(device => {
        deviceExperiences.set(device.deviceId, {
          deviceId: device.deviceId,
          deviceName: device.name,
          project: device.project,
          hasSuccessExperience: false,
          hasFailureExperience: false,
          totalPics: 0,
          successfulPics: 0,
          failedPics: 0,
          totalAttempts: 0,
          successfulAttempts: 0,
          failedAttempts: 0
        });
      });
      
      // Process OTA updates to determine device experiences
      otaUpdates.forEach(update => {
        const deviceExp = deviceExperiences.get(update.deviceId);
        if (deviceExp) {
          deviceExp.totalPics++;
          deviceExp.totalAttempts += update.totalAttempts || 0;
          deviceExp.successfulAttempts += update.successAttempts || 0;
          deviceExp.failedAttempts += update.failureAttempts || 0;
          
          if (update.finalStatus === 'success') {
            deviceExp.successfulPics++;
          } else if (update.finalStatus === 'failed') {
            deviceExp.failedPics++;
          }
          
          // Mark device as having success/failure experiences
          if (update.successAttempts > 0) {
            deviceExp.hasSuccessExperience = true;
          }
          if (update.failureAttempts > 0) {
            deviceExp.hasFailureExperience = true;
          }
        }
      });
      
      // Calculate statistics
      const deviceStats = Array.from(deviceExperiences.values());
      const devicesWithSuccess = deviceStats.filter(d => d.hasSuccessExperience).length;
      const devicesWithFailure = deviceStats.filter(d => d.hasFailureExperience).length;
      const devicesWithBoth = deviceStats.filter(d => d.hasSuccessExperience && d.hasFailureExperience).length;
      const devicesWithOnlySuccess = deviceStats.filter(d => d.hasSuccessExperience && !d.hasFailureExperience).length;
      const devicesWithOnlyFailure = deviceStats.filter(d => !d.hasSuccessExperience && d.hasFailureExperience).length;
      const devicesWithNoExperience = deviceStats.filter(d => !d.hasSuccessExperience && !d.hasFailureExperience).length;
      
      return {
        totalDevices: deviceStats.length,
        devicesWithSuccess,
        devicesWithFailure,
        devicesWithBoth,
        devicesWithOnlySuccess,
        devicesWithOnlyFailure,
        devicesWithNoExperience,
        deviceDetails: deviceStats,
        summary: {
          successRate: deviceStats.length > 0 ? (devicesWithSuccess / deviceStats.length) * 100 : 0,
          failureRate: deviceStats.length > 0 ? (devicesWithFailure / deviceStats.length) * 100 : 0,
          mixedRate: deviceStats.length > 0 ? (devicesWithBoth / deviceStats.length) * 100 : 0
        }
      };
    } catch (error) {
      console.error('Error getting dashboard device stats:', error);
      throw error;
    }
  }
  
  // Get daily ESP statistics for dashboard charts
  static async getDailyDeviceStats(startDate, endDate, projectId = null) {
    try {
      const dailyStats = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dayStart = new Date(currentDate);
        dayStart.setUTCHours(0, 0, 0, 0);
        
        const dayEnd = new Date(currentDate);
        dayEnd.setUTCHours(23, 59, 59, 999);
        
        const dayStats = await this.getDashboardESPStats(dayStart, dayEnd, projectId);
        
        dailyStats.push({
          date: currentDate.toISOString().slice(0, 10),
          dayName: currentDate.toLocaleDateString(undefined, { weekday: 'short' }),
          fullDate: currentDate.toLocaleDateString(undefined, { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          }),
          devicesWithSuccess: dayStats.totalPicsWithSuccess,  // Total PIC success experiences
          devicesWithFailure: dayStats.totalPicsWithFailure,  // Total PIC failure experiences
          totalDevices: dayStats.totalESPs
        });
        
        // Move to next day
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
      
      return dailyStats;
    } catch (error) {
      console.error('Error getting daily ESP stats:', error);
      throw error;
    }
  }

  // Get weekly ESP statistics for dashboard charts
  static async getWeeklyDeviceStats(startDate, endDate, projectId = null) {
    try {
      const weeklyStats = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const weekStart = new Date(currentDate);
        weekStart.setUTCHours(0, 0, 0, 0);
        
        const weekEnd = new Date(currentDate);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        weekEnd.setUTCHours(23, 59, 59, 999);
        
        const weekStats = await this.getDashboardESPStats(weekStart, weekEnd, projectId);
        
        weeklyStats.push({
          dateRange: `Week ${Math.floor((currentDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}`,
          devicesWithSuccess: weekStats.totalPicsWithSuccess,  // Total PIC success experiences
          devicesWithFailure: weekStats.totalPicsWithFailure,  // Total PIC failure experiences
          totalDevices: weekStats.totalESPs
        });
        
        // Move to next week
        currentDate.setUTCDate(currentDate.getUTCDate() + 7);
      }
      
      return weeklyStats;
    } catch (error) {
      console.error('Error getting weekly ESP stats:', error);
      throw error;
    }
  }
  
  // Update ESP-level statistics based on PIC experiences
  static async updateESPStats(deviceId) {
    try {
      // Get all OTA updates for this ESP device
      const otaUpdates = await OTAUpdate.find({ deviceId });
      
      if (otaUpdates.length === 0) {
        console.log(`No OTA updates found for ESP ${deviceId}`);
        return null;
      }
      
      // Group OTA updates by firmware version
      const updatesByVersion = new Map();
      
      otaUpdates.forEach(update => {
        const version = update.updatedVersion;
        if (!updatesByVersion.has(version)) {
          updatesByVersion.set(version, []);
        }
        updatesByVersion.get(version).push(update);
      });
      
      // Calculate ESP statistics for each firmware version
      const espStats = {
        totalPicsWithSuccess: 0,
        totalPicsWithFailure: 0,
        picsWithSuccess: [],
        picsWithFailure: [],
        byFirmwareVersion: [],
        lastUpdated: new Date()
      };
      
      // Track unique PICs across all versions for overall stats
      const allPicsWithSuccess = new Set();
      const allPicsWithFailure = new Set();
      
      // Process each firmware version
      for (const [version, updates] of updatesByVersion) {
        // Track PICs for this version
        const picsWithSuccess = new Set();
        const picsWithFailure = new Set();
        
        // Process each PIC update for this version
        updates.forEach(update => {
          const picId = update.pic_id;
          
          // Check if this PIC had success experiences
          if (update.successAttempts > 0) {
            picsWithSuccess.add(picId);
            allPicsWithSuccess.add(picId);
          }
          
          // Check if this PIC had failure experiences
          if (update.failureAttempts > 0) {
            picsWithFailure.add(picId);
            allPicsWithFailure.add(picId);
          }
        });
        
        // Calculate version-specific statistics
        const totalPics = new Set([...picsWithSuccess, ...picsWithFailure]).size;
        
        espStats.byFirmwareVersion.push({
          version,
          date: new Date(),
          picsWithSuccess: picsWithSuccess.size,
          picsWithFailure: picsWithFailure.size,
          totalPics,
          picIdsWithSuccess: Array.from(picsWithSuccess),
          picIdsWithFailure: Array.from(picsWithFailure),
          lastUpdated: new Date()
        });
        
        // Add to total counts (count each version separately)
        espStats.totalPicsWithSuccess += picsWithSuccess.size;
        espStats.totalPicsWithFailure += picsWithFailure.size;
      }
      
      // Set overall PIC ID arrays
      espStats.picsWithSuccess = Array.from(allPicsWithSuccess);
      espStats.picsWithFailure = Array.from(allPicsWithFailure);
      
      // Update device with ESP statistics
      await Device.findOneAndUpdate(
        { deviceId },
        { 
          $set: { 
            espStats: espStats 
          }
        },
        { new: true }
      );
      
      console.log(`Updated ESP stats for device ${deviceId}:`, espStats);
      return espStats;
    } catch (error) {
      console.error('Error updating ESP stats:', error);
      throw error;
    }
  }
  
  // Get ESP-level statistics for a specific device
  static async getESPStats(deviceId) {
    try {
      const device = await Device.findOne({ deviceId });
      return device ? device.espStats : null;
    } catch (error) {
      console.error('Error getting ESP stats:', error);
      throw error;
    }
  }
  
  // Get all ESPs with their statistics
  static async getAllESPsWithStats() {
    try {
      const devices = await Device.find().sort({ 'espStats.lastUpdated': -1 });
      return devices;
    } catch (error) {
      console.error('Error getting all ESPs with stats:', error);
      throw error;
    }
  }
  
  // Update ESP statistics for all devices
  static async updateAllESPStats() {
    try {
      const devices = await Device.find();
      const results = [];
      
      for (const device of devices) {
        try {
          const stats = await this.updateESPStats(device.deviceId);
          results.push({ deviceId: device.deviceId, success: true, stats });
        } catch (error) {
          results.push({ deviceId: device.deviceId, success: false, error: error.message });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error updating all ESP stats:', error);
      throw error;
    }
  }
  
  // Get ESP-level statistics for dashboard (ESPs with PIC success/failure experiences)
  static async getDashboardESPStats(startDate, endDate, projectId = null) {
    try {
      // Get all OTA updates within the date range
      const dateFilter = {
        lastUpdated: {
          $gte: startDate,
          $lte: endDate
        }
      };
      
      const otaUpdates = await OTAUpdate.find(dateFilter);
      
      // Get all devices (filtered by project if specified)
      let deviceFilter = {};
      if (projectId) {
        deviceFilter.project = projectId;
      }
      const devices = await Device.find(deviceFilter);
      
      // Create a map to track ESP experiences
      const espExperiences = new Map();
      
      // Initialize all ESPs with no experiences
      devices.forEach(device => {
        espExperiences.set(device.deviceId, {
          deviceId: device.deviceId,
          deviceName: device.name,
          project: device.project,
          hasPicsWithSuccess: false,
          hasPicsWithFailure: false,
          totalPicsWithSuccess: 0,
          totalPicsWithFailure: 0,
          totalPics: 0,
          picsWithSuccess: [],
          picsWithFailure: []
        });
      });
      
      // Group updates by ESP device
      const updatesByESP = new Map();
      otaUpdates.forEach(update => {
        if (!updatesByESP.has(update.deviceId)) {
          updatesByESP.set(update.deviceId, []);
        }
        updatesByESP.get(update.deviceId).push(update);
      });
      
      // Process each ESP's PIC experiences
      for (const [espId, updates] of updatesByESP) {
        const espExp = espExperiences.get(espId);
        if (!espExp) continue;
        
        // Track unique PICs for this ESP
        const picsWithSuccess = new Set();
        const picsWithFailure = new Set();
        
        // Process each OTA update (each update represents a PIC experience)
        updates.forEach(update => {
          const picId = update.pic_id;
          
          // Check if this PIC had success experiences
          if (update.successAttempts > 0) {
            picsWithSuccess.add(picId);
          }
          
          // Check if this PIC had failure experiences
          if (update.failureAttempts > 0) {
            picsWithFailure.add(picId);
          }
        });
        
        // Calculate ESP statistics
        espExp.totalPicsWithSuccess = picsWithSuccess.size;
        espExp.totalPicsWithFailure = picsWithFailure.size;
        espExp.totalPics = new Set([...picsWithSuccess, ...picsWithFailure]).size;
        espExp.hasPicsWithSuccess = picsWithSuccess.size > 0;
        espExp.hasPicsWithFailure = picsWithFailure.size > 0;
        espExp.picsWithSuccess = Array.from(picsWithSuccess);
        espExp.picsWithFailure = Array.from(picsWithFailure);
      }
      
      // Calculate summary statistics - COUNT TOTAL PIC EXPERIENCES, not unique ESPs
      const espStats = Array.from(espExperiences.values());
      
      // Count total PIC experiences across all ESPs
      const totalPicsWithSuccess = espStats.reduce((sum, esp) => sum + esp.totalPicsWithSuccess, 0);
      const totalPicsWithFailure = espStats.reduce((sum, esp) => sum + esp.totalPicsWithFailure, 0);
      
      // Count ESPs with any PIC experiences
      const espsWithPicsSuccess = espStats.filter(e => e.hasPicsWithSuccess).length;
      const espsWithPicsFailure = espStats.filter(e => e.hasPicsWithFailure).length;
      const espsWithNoPicsExperience = espStats.filter(e => !e.hasPicsWithSuccess && !e.hasPicsWithFailure).length;
      
      return {
        totalESPs: espStats.length,
        // Total PIC experiences (this is what you want for the dashboard)
        totalPicsWithSuccess,
        totalPicsWithFailure,
        // ESP-level counts (for reference)
        espsWithPicsSuccess,
        espsWithPicsFailure,
        espsWithNoPicsExperience,
        espDetails: espStats,
        summary: {
          successRate: espStats.length > 0 ? (espsWithPicsSuccess / espStats.length) * 100 : 0,
          failureRate: espStats.length > 0 ? (espsWithPicsFailure / espStats.length) * 100 : 0
        }
      };
    } catch (error) {
      console.error('Error getting dashboard ESP stats:', error);
      throw error;
    }
  }
}

module.exports = DeviceStatsService; 