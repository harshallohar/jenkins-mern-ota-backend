const Router = require('express').Router();
const OTAUpdate = require('../Models/OTAUpdateModel');
const StatusManagement = require('../Models/StatusManagementModel');
const DashboardStats = require('../Models/DashboardStatsModel');

// Helper function to determine update type based on versions
const determineUpdateType = (previousVersion, updatedVersion) => {
  // Convert versions to numbers for comparison
  const prev = parseFloat(previousVersion);
  const updated = parseFloat(updatedVersion);
  
  // Check if updatedVersion is "0.0" (failure case)
  if (updatedVersion === "0.0") {
    return 'failure';
  }
  
  // Check if previousVersion < updatedVersion (success case)
  if (prev < updated) {
    return 'success';
  }
  
  // If versions are equal or previous > updated
  return 'other';
};

// Helper function to get today's date at midnight in local timezone
const getTodayDate = () => {
  const today = new Date();
  
  // Get current local date components
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  
  // Create a new date at midnight in local timezone
  const localMidnight = new Date(year, month, day, 0, 0, 0, 0);
  
  console.log(`📅 getTodayDate: Current time: ${today.toISOString()}`);
  console.log(`📅 getTodayDate: Local midnight: ${localMidnight.toISOString()}`);
  console.log(`📅 getTodayDate: Local date string: ${localMidnight.toLocaleDateString()}`);
  
  return localMidnight;
};

// Helper function to find or create dashboard stats for a device and date
const findOrCreateDashboardStats = async (deviceId, date) => {
  try {
    // Ensure date is a proper Date object and normalize to local midnight
    const normalizedDate = new Date(date);
    const year = normalizedDate.getFullYear();
    const month = normalizedDate.getMonth();
    const day = normalizedDate.getDate();
    const localMidnight = new Date(year, month, day, 0, 0, 0, 0);
    
    console.log(`📅 findOrCreateDashboardStats: Input date: ${date}`);
    console.log(`📅 findOrCreateDashboardStats: Normalized local midnight: ${localMidnight.toISOString()}`);
    console.log(`📅 findOrCreateDashboardStats: Local date string: ${localMidnight.toLocaleDateString()}`);
    
    // Find existing stats for this device and date
    // Use a wider range to account for timezone differences
    const startOfDay = new Date(localMidnight);
    const endOfDay = new Date(localMidnight);
    endOfDay.setDate(endOfDay.getDate() + 1);
    
    let stats = await DashboardStats.findOne({
      deviceId: deviceId,
      'stats.date': {
        $gte: startOfDay,
        $lt: endOfDay
      }
    });
    
    if (!stats) {
      // Create new stats document - the pre-save middleware will handle structure
      stats = new DashboardStats({
        deviceId: deviceId,
        stats: {
          date: localMidnight
        }
      });
      console.log('📊 Created new dashboard stats for device:', deviceId, 'date:', localMidnight.toLocaleDateString());
    } else {
      console.log('📊 Found existing dashboard stats for device:', deviceId, 'date:', stats.stats.date.toLocaleDateString());
      
      // Check if the existing document has incorrect structure and fix it
      if (Array.isArray(stats.stats)) {
        console.log('⚠️  Found incorrect stats structure (array), fixing...');
        // Extract the first stats object if it's an array
        const firstStats = stats.stats[0];
        if (firstStats && firstStats.date) {
          stats.stats = {
            date: localMidnight,
            records: {
              success: [],
              failure: [],
              other: []
            }
          };
          console.log('✅ Fixed stats structure from array to object');
        } else {
          // If we can't extract valid data, create new structure
          stats.stats = {
            date: localMidnight,
            records: {
              success: [],
              failure: [],
              other: []
            }
          };
          console.log('✅ Created new stats structure');
        }
      } else if (!stats.stats || typeof stats.stats !== 'object') {
        // If stats is not an object, create proper structure
        console.log('⚠️  Found invalid stats structure, creating new one...');
        stats.stats = {
          date: localMidnight,
          records: {
            success: [],
            failure: [],
            other: []
          }
        };
      } else {
        // Ensure the date is current
        stats.stats.date = localMidnight;
        
        // Ensure records arrays exist
        if (!stats.stats.records) {
          stats.stats.records = { success: [], failure: [], other: [] };
        }
        if (!Array.isArray(stats.stats.records.success)) {
          stats.stats.records.success = [];
        }
        if (!Array.isArray(stats.stats.records.failure)) {
          stats.stats.records.failure = [];
        }
        if (!Array.isArray(stats.stats.records.other)) {
          stats.stats.records.other = [];
        }
      }
    }
    
    return stats;
  } catch (error) {
    console.error('Error in findOrCreateDashboardStats:', error);
    throw error;
  }
};

// POST: Receive ESP32 OTA update report
Router.post('/', async (req, res) => {
  try {
    const { pic_id, deviceId, status, previousVersion, updatedVersion } = req.body;
    
    // Validate required fields
    if (!pic_id || !deviceId || !status || !previousVersion || !updatedVersion) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: pic_id, deviceId, status, previousVersion, updatedVersion'
      });
    }
    
    // Fetch status management data for the device
    const statusManagement = await StatusManagement.findOne({ deviceId: deviceId });
    if (!statusManagement) {
      return res.status(404).json({
        success: false,
        message: 'Status management configuration not found for this device'
      });
    }
    
    // Find the status code configuration
    const statusCode = statusManagement.statusCodes.find(sc => sc.code.toString() === status);
    if (!statusCode) {
      return res.status(404).json({
        success: false,
        message: 'Status code not found in status management configuration'
      });
    }
    
    // Determine update type
    const updateType = determineUpdateType(previousVersion, updatedVersion);
    
    // Create timestamp for this update
    const timestamp = new Date();
    
    // Create OTA update record
    const otaUpdate = new OTAUpdate({
      pic_id,
      deviceId,
      status,
      previousVersion,
      updatedVersion,
      statusMessage: statusCode.message,
      badge: statusCode.badge,
      color: statusCode.color,
      timestamp: timestamp
    });
    
    // Save OTA update
    await otaUpdate.save();
    
    // Handle dashboard stats
    const today = getTodayDate();
    const dashboardStats = await findOrCreateDashboardStats(deviceId, today);
    
    // Create record for dashboard
    const record = {
      picID: pic_id,
      deviceId: deviceId,
      previousVersion: previousVersion,
      updatedVersion: updatedVersion,
      timestamp: timestamp,
      date: new Date()
    };
    
    if (updateType === 'success') {
      // Check if this PIC ID exists in failure records for today and remove it
      // Note: We remove by PIC ID only, as the same PIC ID can have multiple attempts
      if (Array.isArray(dashboardStats.stats.records.failure)) {
        dashboardStats.stats.records.failure = dashboardStats.stats.records.failure.filter(
          r => r.picID !== pic_id
        );
      } else {
        dashboardStats.stats.records.failure = [];
      }
      
      // Add to success records
      if (Array.isArray(dashboardStats.stats.records.success)) {
        dashboardStats.stats.records.success.push(record);
      } else {
        dashboardStats.stats.records.success = [record];
      }
      
    } else if (updateType === 'failure') {
      // Check if this exact record already exists in failure (by PIC ID, versions, and timestamp)
      // Using timestamp ensures we can track multiple attempts with the same PIC ID
      let existingFailure = false;
      if (Array.isArray(dashboardStats.stats.records.failure)) {
        existingFailure = dashboardStats.stats.records.failure.find(
          r => r.picID === pic_id && 
               r.previousVersion === previousVersion && 
               r.updatedVersion === updatedVersion &&
               r.timestamp.getTime() === timestamp.getTime()
        );
      }
      
      // Only add if not already present
      if (!existingFailure) {
        if (Array.isArray(dashboardStats.stats.records.failure)) {
          dashboardStats.stats.records.failure.push(record);
        } else {
          dashboardStats.stats.records.failure = [record];
        }
      }
      
    } else {
      // For 'other' type, just add to other records
      if (Array.isArray(dashboardStats.stats.records.other)) {
        dashboardStats.stats.records.other.push(record);
      } else {
        dashboardStats.stats.records.other = [record];
      }
    }
    
    // Save dashboard stats
    try {
      await dashboardStats.save();
      console.log('✅ Dashboard stats saved successfully');
    } catch (saveError) {
      console.error('❌ Error saving dashboard stats:', saveError);
      if (saveError.name === 'ValidationError') {
        console.error('Validation errors:', saveError.errors);
        console.error('Stats document structure:', JSON.stringify(dashboardStats, null, 2));
      }
      throw new Error(`Failed to save dashboard stats: ${saveError.message}`);
    }
    
    res.status(200).json({
      success: true,
      message: 'OTA update report processed successfully',
      data: {
        otaUpdate: otaUpdate,
        dashboardStats: dashboardStats,
        updateType: updateType,
        timestamp: timestamp
      }
    });
    
  } catch (error) {
    console.error('Error processing OTA update report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// GET: Retrieve OTA updates with optional filtering
Router.get('/', async (req, res) => {
  try {
    const { deviceId, projectId, limit = 100, page = 1 } = req.query;
    
    let query = {};
    if (deviceId) {
      query.deviceId = deviceId;
    }
    
    // If projectId is provided, we need to filter by devices in that project
    if (projectId) {
      // This would require a join with the Device model to get devices in the project
      // For now, we'll handle this in the frontend by filtering after fetching
      // In a production environment, you might want to use aggregation pipeline
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const updates = await OTAUpdate.find(query)
      .sort({ timestamp: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await OTAUpdate.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: updates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Error retrieving OTA updates:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// GET: Get OTA update by ID
Router.get('/:id', async (req, res) => {
  try {
    const update = await OTAUpdate.findById(req.params.id);
    
    if (!update) {
      return res.status(404).json({
        success: false,
        message: 'OTA update not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: update
    });
    
  } catch (error) {
    console.error('Error retrieving OTA update:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// DELETE: Delete OTA update by ID
Router.delete('/:id', async (req, res) => {
  try {
    const update = await OTAUpdate.findByIdAndDelete(req.params.id);
    
    if (!update) {
      return res.status(404).json({
        success: false,
        message: 'OTA update not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'OTA update deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting OTA update:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = Router;



