const Router = require('express').Router();
const OTAUpdate = require('../Models/OTAUpdateModel');
const StatusManagement = require('../Models/StatusManagementModel');
const ActivityLogger = require('../Services/ActivityLogger');
const DeviceStatsService = require('../Services/DeviceStatsService');
const { authenticate } = require('../Middleware/auth');

// Get all OTA updates with status management information
Router.get('/', async (req, res) => {
  try {
    const updates = await OTAUpdate.find().sort({ lastUpdated: -1 });
    
    // Fetch status management data for all devices
    const statusManagementData = await StatusManagement.find();
    
    // Enhance updates with status management information
    const enhancedUpdates = updates.map(update => {
      const statusEntry = statusManagementData.find(sm => sm.deviceId === update.deviceId);
      const latestStatus = update.getLatestStatus();
      let statusMessage = latestStatus ? latestStatus.status : 'No status';
      
      if (statusEntry && statusEntry.statusCodes && latestStatus) {
        // Try to find matching status code
        const statusCode = parseInt(latestStatus.status);
        if (!isNaN(statusCode)) {
          const matchingCode = statusEntry.statusCodes.find(code => code.code === statusCode);
          if (matchingCode) {
            statusMessage = matchingCode.message;
          }
        }
      }
      
      const summary = update.getStatusSummary();
      
      return {
        ...update.toObject(),
        status: latestStatus ? latestStatus.status : 'No status',
        statusMessage,
        hasStatusManagement: !!statusEntry,
        summary
      };
    });
    
    res.status(200).json(enhancedUpdates);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching OTA updates', error: err.message });
  }
});

// Get OTA updates for a specific device with status management
Router.get('/device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const updates = await OTAUpdate.find({ deviceId }).sort({ lastUpdated: -1 });
    
    // Fetch status management data for this device
    const statusEntry = await StatusManagement.findOne({ deviceId });
    
    // Enhance updates with status management information
    const enhancedUpdates = updates.map(update => {
      const latestStatus = update.getLatestStatus();
      let statusMessage = latestStatus ? latestStatus.status : 'No status';
      
      if (statusEntry && statusEntry.statusCodes && latestStatus) {
        // Try to find matching status code
        const statusCode = parseInt(latestStatus.status);
        if (!isNaN(statusCode)) {
          const matchingCode = statusEntry.statusCodes.find(code => code.code === statusCode);
          if (matchingCode) {
            statusMessage = matchingCode.message;
          }
        }
      }
      
      const summary = update.getStatusSummary();
      
      return {
        ...update.toObject(),
        status: latestStatus ? latestStatus.status : 'No status',
        statusMessage,
        hasStatusManagement: !!statusEntry,
        summary
      };
    });
    
    res.status(200).json(enhancedUpdates);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching OTA updates', error: err.message });
  }
});

// Get detailed PIC information for a specific device
Router.get('/device-pic-details/:deviceId', authenticate, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Get all OTA updates for this device
    const otaUpdates = await OTAUpdate.find({ deviceId });
    
    if (otaUpdates.length === 0) {
      return res.status(404).json({ message: 'No OTA updates found for this device' });
    }
    
    // Group updates by PIC ID
    const picDetails = new Map();
    
    otaUpdates.forEach(update => {
      const picId = update.pic_id;
      
      if (!picDetails.has(picId)) {
        picDetails.set(picId, {
          picId,
          totalAttempts: 0,
          successAttempts: 0,
          failureAttempts: 0,
          firmwareVersions: new Set(),
          finalStatus: 'unknown',
          lastUpdated: update.lastUpdated,
          statusEntries: []
        });
      }
      
      const picDetail = picDetails.get(picId);
      picDetail.totalAttempts += update.totalAttempts;
      picDetail.successAttempts += update.successAttempts;
      picDetail.failureAttempts += update.failureAttempts;
      picDetail.firmwareVersions.add(update.updatedVersion);
      picDetail.statusEntries.push(...update.statusEntries);
      
      // Update final status based on latest entry
      if (update.finalStatus) {
        picDetail.finalStatus = update.finalStatus;
      }
      
      // Update last updated timestamp
      if (update.lastUpdated > picDetail.lastUpdated) {
        picDetail.lastUpdated = update.lastUpdated;
      }
    });
    
    // Convert to array and format the data
    const picDetailsArray = Array.from(picDetails.values()).map(pic => ({
      ...pic,
      firmwareVersions: Array.from(pic.firmwareVersions),
      statusEntries: pic.statusEntries.slice(-5) // Show last 5 status entries
    }));
    
    // Sort by PIC ID
    picDetailsArray.sort((a, b) => a.picId.localeCompare(b.picId));
    
    res.status(200).json({
      deviceId,
      totalPics: picDetailsArray.length,
      picDetails: picDetailsArray,
      summary: {
        totalAttempts: picDetailsArray.reduce((sum, pic) => sum + pic.totalAttempts, 0),
        totalSuccessAttempts: picDetailsArray.reduce((sum, pic) => sum + pic.successAttempts, 0),
        totalFailureAttempts: picDetailsArray.reduce((sum, pic) => sum + pic.failureAttempts, 0),
        picsWithSuccess: picDetailsArray.filter(pic => pic.successAttempts > 0).length,
        picsWithFailure: picDetailsArray.filter(pic => pic.failureAttempts > 0).length,
        picsWithFinalSuccess: picDetailsArray.filter(pic => pic.finalStatus === 'success').length,
        picsWithFinalFailure: picDetailsArray.filter(pic => pic.finalStatus === 'failed').length
      }
    });
  } catch (error) {
    console.error('Error getting device PIC details:', error);
    res.status(500).json({ message: 'Error fetching PIC details', error: error.message });
  }
});

// Get consolidated statistics
Router.get('/statistics', async (req, res) => {
  try {
    const updates = await OTAUpdate.find();
    
    const statistics = {
      totalRecords: updates.length,
      totalAttempts: updates.reduce((sum, update) => sum + update.totalAttempts, 0),
      totalSuccessAttempts: updates.reduce((sum, update) => sum + update.successAttempts, 0),
      totalFailureAttempts: updates.reduce((sum, update) => sum + update.failureAttempts, 0),
      finalSuccessCount: updates.filter(u => u.finalStatus === 'success').length,
      finalFailureCount: updates.filter(u => u.finalStatus === 'failed').length,
      pendingCount: updates.filter(u => u.finalStatus === 'pending').length,
      byFirmwareVersion: {}
    };
    
    // Group by firmware version
    updates.forEach(update => {
      const version = update.updatedVersion;
      if (!statistics.byFirmwareVersion[version]) {
        statistics.byFirmwareVersion[version] = {
          totalRecords: 0,
          totalAttempts: 0,
          successAttempts: 0,
          failureAttempts: 0,
          finalSuccessCount: 0,
          finalFailureCount: 0,
          pendingCount: 0
        };
      }
      
      const versionStats = statistics.byFirmwareVersion[version];
      versionStats.totalRecords++;
      versionStats.totalAttempts += update.totalAttempts;
      versionStats.successAttempts += update.successAttempts;
      versionStats.failureAttempts += update.failureAttempts;
      
      if (update.finalStatus === 'success') versionStats.finalSuccessCount++;
      else if (update.finalStatus === 'failed') versionStats.finalFailureCount++;
      else versionStats.pendingCount++;
    });
    
    res.status(200).json(statistics);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching statistics', error: err.message });
  }
});

// Get device-level statistics
Router.get('/device-stats/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const stats = await DeviceStatsService.getDeviceStats(deviceId);
    
    if (!stats) {
      return res.status(404).json({ message: 'Device not found or no statistics available' });
    }
    
    res.status(200).json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching device statistics', error: err.message });
  }
});

// Get all devices with their statistics
Router.get('/all-device-stats', async (req, res) => {
  try {
    const devices = await DeviceStatsService.getAllDevicesWithStats();
    res.status(200).json(devices);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching all device statistics', error: err.message });
  }
});

// Get summary statistics across all devices
Router.get('/summary-stats', async (req, res) => {
  try {
    const summary = await DeviceStatsService.getSummaryStats();
    res.status(200).json(summary);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching summary stats', error: err.message });
  }
});

// Get device-level statistics for dashboard
Router.get('/dashboard-device-stats', async (req, res) => {
  try {
    const { startDate, endDate, projectId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }
    
    const stats = await DeviceStatsService.getDashboardDeviceStats(
      new Date(startDate),
      new Date(endDate),
      projectId
    );
    
    res.status(200).json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching dashboard device stats', error: err.message });
  }
});

// Get daily device statistics for dashboard charts
Router.get('/daily-device-stats', async (req, res) => {
  try {
    const { startDate, endDate, projectId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }
    
    const stats = await DeviceStatsService.getDailyDeviceStats(
      new Date(startDate),
      new Date(endDate),
      projectId
    );
    
    res.status(200).json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching daily device stats', error: err.message });
  }
});

// Get weekly device statistics for dashboard charts
Router.get('/weekly-device-stats', async (req, res) => {
  try {
    const { startDate, endDate, projectId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }
    
    const stats = await DeviceStatsService.getWeeklyDeviceStats(
      new Date(startDate),
      new Date(endDate),
      projectId
    );
    
    res.status(200).json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching weekly device stats', error: err.message });
  }
});

// Update statistics for all devices
Router.post('/update-all-stats', async (req, res) => {
  try {
    const results = await DeviceStatsService.updateAllDeviceStats();
    res.status(200).json({ message: 'All device stats updated', results });
  } catch (err) {
    res.status(500).json({ message: 'Error updating all device stats', error: err.message });
  }
});

// Get ESP-level statistics for a specific device
Router.get('/esp-stats/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const stats = await DeviceStatsService.getESPStats(deviceId);
    
    if (!stats) {
      return res.status(404).json({ message: 'ESP statistics not found' });
    }
    
    res.status(200).json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching ESP stats', error: err.message });
  }
});

// Get all ESPs with their statistics
Router.get('/all-esp-stats', async (req, res) => {
  try {
    const devices = await DeviceStatsService.getAllESPsWithStats();
    res.status(200).json(devices);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching all ESP stats', error: err.message });
  }
});

// Update ESP statistics for all devices
Router.post('/update-all-esp-stats', async (req, res) => {
  try {
    const results = await DeviceStatsService.updateAllESPStats();
    res.status(200).json({ message: 'All ESP stats updated', results });
  } catch (err) {
    res.status(500).json({ message: 'Error updating all ESP stats', error: err.message });
  }
});

// Get ESP-level statistics for dashboard
Router.get('/dashboard-esp-stats', async (req, res) => {
  try {
    const { startDate, endDate, projectId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }
    
    const stats = await DeviceStatsService.getDashboardESPStats(
      new Date(startDate),
      new Date(endDate),
      projectId
    );
    
    res.status(200).json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching dashboard ESP stats', error: err.message });
  }
});

// Get server time for debugging
Router.get('/server-time', (req, res) => {
  const now = new Date();
  const utcNow = new Date(now.toISOString());
  
  console.log('=== SERVER TIME DEBUG ===');
  console.log('Current Date Object:', now);
  console.log('Current Date String:', now.toString());
  console.log('Current ISO String:', now.toISOString());
  console.log('Current UTC Date:', utcNow.toISOString());
  console.log('Current Timestamp:', now.getTime());
  console.log('Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
  
  res.status(200).json({
    currentTime: now.toISOString(),
    localTime: now.toString(),
    utcTime: utcNow.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: now.getTime(),
    dateOnly: now.toISOString().split('T')[0],
    debug: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hours: now.getHours(),
      minutes: now.getMinutes(),
      seconds: now.getSeconds()
    }
  });
});

// Add new OTA update or update existing record
Router.post('/', async (req, res) => {
  try {
    const { pic_id, deviceId, status, previousVersion, updatedVersion, date } = req.body;
    if (!pic_id || !deviceId || !status || !previousVersion || !updatedVersion) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Check if a record already exists for this PIC ID and firmware version
    let existingUpdate = await OTAUpdate.findOne({ 
      pic_id, 
      updatedVersion 
    });
    
    let updateRecord;
    
    if (existingUpdate) {
      // Update existing record with new status entry
      console.log(`Updating existing record for PIC ${pic_id}, version ${updatedVersion}`);
      
      // Get status message from status management
      let statusMessage = status;
      const statusEntry = await StatusManagement.findOne({ deviceId });
      if (statusEntry && statusEntry.statusCodes) {
        const statusCode = parseInt(status);
        if (!isNaN(statusCode)) {
          const matchingCode = statusEntry.statusCodes.find(code => code.code === statusCode);
          if (matchingCode) {
            statusMessage = matchingCode.message;
          }
        }
      }
      
      // Add new status entry to existing record
      existingUpdate.addStatusEntry(status, statusMessage);
      await existingUpdate.save();
      updateRecord = existingUpdate;
      
    } else {
      // Create new record
      console.log(`Creating new record for PIC ${pic_id}, version ${updatedVersion}`);
      
      // Handle date - use provided date or current time
      let updateDate;
      if (date) {
        updateDate = new Date(date);
        if (isNaN(updateDate.getTime())) {
          return res.status(400).json({ message: 'Invalid date format' });
        }
      } else {
        updateDate = new Date();
      }
      
      // Get status message from status management
      let statusMessage = status;
      const statusEntry = await StatusManagement.findOne({ deviceId });
      if (statusEntry && statusEntry.statusCodes) {
        const statusCode = parseInt(status);
        if (!isNaN(statusCode)) {
          const matchingCode = statusEntry.statusCodes.find(code => code.code === statusCode);
          if (matchingCode) {
            statusMessage = matchingCode.message;
          }
        }
      }
      
      const newUpdate = new OTAUpdate({ 
        pic_id, 
        deviceId, 
        previousVersion, 
        updatedVersion,
        date: updateDate
      });
      
      // Add initial status entry
      newUpdate.addStatusEntry(status, statusMessage);
      await newUpdate.save();
      updateRecord = newUpdate;
    }
    
    // Update device statistics
    try {
      await DeviceStatsService.updateDeviceStats(deviceId);
    } catch (statsError) {
      console.error('Error updating device stats:', statsError);
      // Don't fail the main request if stats update fails
    }
    
    // Update ESP statistics
    try {
      await DeviceStatsService.updateESPStats(deviceId);
    } catch (espStatsError) {
      console.error('Error updating ESP stats:', espStatsError);
      // Don't fail the main request if ESP stats update fails
    }
    
    // Log activity for OTA update
    try {
      const defaultUserId = '507f1f77bcf86cd799439011';
      const latestStatus = updateRecord.getLatestStatus();
      await ActivityLogger.logOTAUpdate(
        defaultUserId,
        deviceId,
        latestStatus ? latestStatus.status : status,
        updatedVersion,
        {
          pic_id,
          previousVersion,
          totalAttempts: updateRecord.totalAttempts,
          finalStatus: updateRecord.finalStatus
        }
      );
    } catch (activityError) {
      console.error('Error logging activity:', activityError);
    }
    
    res.status(201).json(updateRecord);
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key error - this shouldn't happen with our logic, but handle it gracefully
      return res.status(409).json({ message: 'Record already exists for this PIC ID and firmware version' });
    }
    res.status(500).json({ message: 'Error adding OTA update', error: err.message });
  }
});

// Delete OTA update
Router.delete('/:id', async (req, res) => {
  try {
    const deleted = await OTAUpdate.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'OTA update not found' });
    
    // Update device statistics after deletion
    try {
      await DeviceStatsService.updateDeviceStats(deleted.deviceId);
    } catch (statsError) {
      console.error('Error updating device stats after deletion:', statsError);
    }
    
    // Update ESP statistics after deletion
    try {
      await DeviceStatsService.updateESPStats(deleted.deviceId);
    } catch (espStatsError) {
      console.error('Error updating ESP stats after deletion:', espStatsError);
    }
    
    res.status(200).json({ message: 'OTA update deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting OTA update', error: err.message });
  }
});

module.exports = Router; 