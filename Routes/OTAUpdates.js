// routes/otaUpdates.js
const Router = require('express').Router();
const OTAUpdate = require('../Models/OTAUpdateModel');
const StatusManagement = require('../Models/StatusManagementModel');
const DashboardStats = require('../Models/DashboardStatsModel');
const Device = require('../Models/DeviceModel'); // adjust path if needed

// Helper function to determine update type based on versions
const determineUpdateType = (previousVersion, updatedVersion) => {
  const prev = parseFloat(previousVersion);
  const updated = parseFloat(updatedVersion);
  if (updatedVersion === "0.0") return 'failure';
  if (!isNaN(prev) && !isNaN(updated) && prev < updated) return 'success';
  return 'other';
};

// Helper function to get today's date at midnight in local timezone
const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  return new Date(year, month, day, 0, 0, 0, 0);
};

// Helper: find or create dashboard stats doc for device and date
const findOrCreateDashboardStats = async (deviceId, date) => {
  try {
    const normalizedDate = new Date(date);
    const year = normalizedDate.getFullYear();
    const month = normalizedDate.getMonth();
    const day = normalizedDate.getDate();
    const localMidnight = new Date(year, month, day, 0, 0, 0, 0);

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
      stats = new DashboardStats({
        deviceId: deviceId,
        stats: {
          date: localMidnight,
          records: {
            success: [],
            failure: [],
            other: []
          }
        }
      });
    } else {
      // normalize structure
      if (!stats.stats || typeof stats.stats !== 'object') {
        stats.stats = {
          date: localMidnight,
          records: { success: [], failure: [], other: [] }
        };
      } else {
        stats.stats.date = localMidnight;
        if (!stats.stats.records) stats.stats.records = { success: [], failure: [], other: [] };
        stats.stats.records.success = Array.isArray(stats.stats.records.success) ? stats.stats.records.success : [];
        stats.stats.records.failure = Array.isArray(stats.stats.records.failure) ? stats.stats.records.failure : [];
        stats.stats.records.other = Array.isArray(stats.stats.records.other) ? stats.stats.records.other : [];
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

    if (!pic_id || !deviceId || !status || !previousVersion || !updatedVersion) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: pic_id, deviceId, status, previousVersion, updatedVersion'
      });
    }

    const statusManagement = await StatusManagement.findOne({ deviceId: deviceId });
    if (!statusManagement) {
      return res.status(404).json({
        success: false,
        message: 'Status management configuration not found for this device'
      });
    }

    const statusCode = statusManagement.statusCodes.find(sc => sc.code.toString() === status);
    if (!statusCode) {
      return res.status(404).json({
        success: false,
        message: 'Status code not found in status management configuration'
      });
    }

    const updateType = determineUpdateType(previousVersion, updatedVersion);
    const timestamp = new Date();

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

    await otaUpdate.save();

    // Update dashboard stats
    const today = getTodayDate();
    const dashboardStats = await findOrCreateDashboardStats(deviceId, today);

    const record = {
      picID: pic_id,
      deviceId: deviceId,
      previousVersion: previousVersion,
      updatedVersion: updatedVersion,
      timestamp: timestamp,
      date: new Date()
    };

    if (updateType === 'success') {
      if (Array.isArray(dashboardStats.stats.records.failure)) {
        dashboardStats.stats.records.failure = dashboardStats.stats.records.failure.filter(r => r.picID !== pic_id);
      } else {
        dashboardStats.stats.records.failure = [];
      }
      if (Array.isArray(dashboardStats.stats.records.success)) {
        dashboardStats.stats.records.success.push(record);
      } else {
        dashboardStats.stats.records.success = [record];
      }
    } else if (updateType === 'failure') {
      let existingFailure = false;
      if (Array.isArray(dashboardStats.stats.records.failure)) {
        existingFailure = dashboardStats.stats.records.failure.find(
          r => r.picID === pic_id &&
               r.previousVersion === previousVersion &&
               r.updatedVersion === updatedVersion &&
               r.timestamp && r.timestamp.getTime && (new Date(r.timestamp)).getTime() === timestamp.getTime()
        );
      }
      if (!existingFailure) {
        if (Array.isArray(dashboardStats.stats.records.failure)) {
          dashboardStats.stats.records.failure.push(record);
        } else {
          dashboardStats.stats.records.failure = [record];
        }
      }
    } else {
      if (Array.isArray(dashboardStats.stats.records.other)) {
        dashboardStats.stats.records.other.push(record);
      } else {
        dashboardStats.stats.records.other = [record];
      }
    }

    try {
      await dashboardStats.save();
      console.log('✅ Dashboard stats saved successfully');
    } catch (saveError) {
      console.error('❌ Error saving dashboard stats records:', saveError);
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


// GET: Retrieve OTA updates with optional filtering, plus aggregated counts
Router.get('/', async (req, res) => {
  try {
    const {
      deviceId,
      projectId,
      limit = 100,
      page = 1,
      badge,          // optional: 'success'|'failure'|'other'|'all'
      versionQuery    // optional: string to search versions (behavior below)
    } = req.query;

    // Build base query (applied to counts and listing)
    let baseQuery = {};

    if (deviceId) {
      baseQuery.deviceId = deviceId;
    }

    // If projectId provided, fetch deviceIds in that project and restrict
    if (projectId) {
      const deviceIds = await Device.find({ project: projectId }).distinct('deviceId');
      if (!deviceIds || deviceIds.length === 0) {
        // nothing for this project
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 },
          counts: { success: 0, failure: 0, other: 0, total: 0 }
        });
      }
      baseQuery.deviceId = { $in: deviceIds };
    }

    // If versionQuery provided, we will apply it to the appropriate version field.
    // By convention: if badge === 'failure' -> search previousVersion; otherwise search updatedVersion.
    let versionField = 'updatedVersion';
    if (badge === 'failure') versionField = 'previousVersion';

    // Build a query object for counts (include versionQuery if provided)
    const countsBaseQuery = { ...baseQuery };
    if (versionQuery && typeof versionQuery === 'string' && versionQuery.trim() !== '') {
      const vq = versionQuery.trim();
      countsBaseQuery[versionField] = { $regex: vq, $options: 'i' };
    }

    // For listing page, apply baseQuery plus potential badge and versionQuery filters (if badge specified, we filter listing to that badge)
    const pageQuery = { ...baseQuery };
    if (badge && badge !== 'all') {
      pageQuery.badge = badge;
    }
    if (versionQuery && typeof versionQuery === 'string' && versionQuery.trim() !== '') {
      const vq = versionQuery.trim();
      pageQuery[versionField] = { $regex: vq, $options: 'i' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch paginated page items
    const updates = await OTAUpdate.find(pageQuery)
      .sort({ timestamp: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // Total count for pagination (pageQuery without limit/skip)
    const total = await OTAUpdate.countDocuments(pageQuery);

    // Compute counts per badge but using countsBaseQuery (which includes project/device and versionQuery, but NOT badge)
    const [successCount, failureCount, otherCount] = await Promise.all([
      OTAUpdate.countDocuments({ ...countsBaseQuery, badge: 'success' }),
      OTAUpdate.countDocuments({ ...countsBaseQuery, badge: 'failure' }),
      OTAUpdate.countDocuments({ ...countsBaseQuery, badge: { $nin: ['success', 'failure'] } })
    ]);

    res.status(200).json({
      success: true,
      data: updates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      counts: {
        success: successCount,
        failure: failureCount,
        other: otherCount,
        total: successCount + failureCount + otherCount
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


// GET by id
Router.get('/:id', async (req, res) => {
  try {
    const update = await OTAUpdate.findById(req.params.id);
    if (!update) {
      return res.status(404).json({ success: false, message: 'OTA update not found' });
    }
    res.status(200).json({ success: true, data: update });
  } catch (error) {
    console.error('Error retrieving OTA update:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

// DELETE by id
Router.delete('/:id', async (req, res) => {
  try {
    const update = await OTAUpdate.findByIdAndDelete(req.params.id);
    if (!update) {
      return res.status(404).json({ success: false, message: 'OTA update not found' });
    }
    res.status(200).json({ success: true, message: 'OTA update deleted successfully' });
  } catch (error) {
    console.error('Error deleting OTA update:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

module.exports = Router;
