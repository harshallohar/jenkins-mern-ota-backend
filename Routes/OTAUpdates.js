// routes/otaUpdates.js
const Router = require('express').Router();
const OTAUpdate = require('../Models/OTAUpdateModel');
const StatusManagement = require('../Models/StatusManagementModel');
const DashboardStats = require('../Models/DashboardStatsModel');
const Device = require('../Models/DeviceModel'); // adjust path if needed

// Helper: safely parse truthy/falsey payloads into booleans
const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    if (normalized === '1') return true;
    if (normalized === '0') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return Boolean(value);
};

const normalizeVersionParts = (version) => {
  if (typeof version !== 'string') {
    if (version === undefined || version === null) {
      return [0];
    }
    version = String(version);
  }
  if (version.trim() === '') return [0];
  return version
    .split('.')
    .map(part => {
      const num = parseInt(part, 10);
      return isNaN(num) ? 0 : num;
    });
};

// Returns:
//  -1 => previousVersion < updatedVersion
//   0 => equal
//   1 => previousVersion > updatedVersion
const compareVersions = (previousVersion, updatedVersion) => {
  const prevParts = normalizeVersionParts(previousVersion);
  const updatedParts = normalizeVersionParts(updatedVersion);
  const maxLength = Math.max(prevParts.length, updatedParts.length);

  for (let i = 0; i < maxLength; i++) {
    const prev = prevParts[i] ?? 0;
    const updated = updatedParts[i] ?? 0;
    if (prev > updated) return 1;
    if (prev < updated) return -1;
  }

  return 0;
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
Router.post('/report', async (req, res) => {
  try {
    const {
      pic_id,
      deviceId,
      status,
      previousVersion,
      updatedVersion,
      reprogramming: reprogrammingInput
    } = req.body;

    const requiredFieldMap = {
      pic_id,
      deviceId,
      status,
      previousVersion,
      updatedVersion
    };

    const missingFields = Object.entries(requiredFieldMap)
      .filter(([, value]) => value === undefined || value === null || String(value).trim() === '')
      .map(([key]) => key);

    if (reprogrammingInput === undefined || reprogrammingInput === null || String(reprogrammingInput).trim() === '') {
      missingFields.push('reprogramming');
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const sanitizedPreviousVersion = String(previousVersion).trim();
    const sanitizedUpdatedVersion = String(updatedVersion).trim();
    const isReprogramming = parseBoolean(reprogrammingInput);

    const statusManagement = await StatusManagement.findOne({ deviceId: deviceId });
    if (!statusManagement) {
      return res.status(404).json({
        success: false,
        message: 'Status management configuration not found for this device'
      });
    }

    const statusCodes = Array.isArray(statusManagement.statusCodes) ? statusManagement.statusCodes : [];
    const statusCode = statusCodes.find(sc => sc.code.toString() === status.toString());
    if (!statusCode) {
      return res.status(404).json({
        success: false,
        message: 'Status code not found in status management configuration'
      });
    }

    const baseBadge = statusCode.badge || 'other';
    let finalBadge = baseBadge;
    const versionComparison = compareVersions(sanitizedPreviousVersion, sanitizedUpdatedVersion);
    const isVersionUpgrade = versionComparison === -1;
    const isVersionEqual = versionComparison === 0;
    const shouldHandleReprogrammingSuccess = isReprogramming && baseBadge === 'success';
    const alreadyUpdatedCase = !isReprogramming && isVersionEqual && baseBadge === 'other';
    const lowerToUpper = !isReprogramming && isVersionUpgrade;

    if (shouldHandleReprogrammingSuccess || alreadyUpdatedCase) {
      finalBadge = 'other';
    }

    const timestamp = new Date();

    const otaUpdate = new OTAUpdate({
      pic_id,
      deviceId,
      status,
      previousVersion: sanitizedPreviousVersion,
      updatedVersion: sanitizedUpdatedVersion,
      statusMessage: statusCode.message,
      badge: finalBadge,
      color: statusCode.color,
      reprogramming: isReprogramming,
      recovered: finalBadge === 'failure' ? false : true,
      timestamp: timestamp
    });

    await otaUpdate.save();

    let dashboardStats = null;
    let dashboardModified = false;
    const needsDashboardUpdate = shouldHandleReprogrammingSuccess || alreadyUpdatedCase || lowerToUpper;

    if (needsDashboardUpdate) {
      const today = getTodayDate();
      dashboardStats = await findOrCreateDashboardStats(deviceId, today);

      // Ensure record buckets exist
      const records = dashboardStats.stats.records || {};
      dashboardStats.stats.records = records;
      records.success = Array.isArray(records.success) ? records.success : [];
      records.failure = Array.isArray(records.failure) ? records.failure : [];
      records.other = Array.isArray(records.other) ? records.other : [];

      const baseRecord = {
        picID: pic_id,
        deviceId: deviceId,
        status: status,
        statusMessage: statusCode.message,
        badge: finalBadge,
        previousVersion: sanitizedPreviousVersion,
        updatedVersion: sanitizedUpdatedVersion,
        reprogramming: isReprogramming,
        timestamp: timestamp,
        date: dashboardStats.stats.date || today
      };

      const addRecord = (bucket, overrides = {}) => {
        const record = {
          ...baseRecord,
          recovered: bucket === 'failure' ? false : true,
          ...overrides
        };
        records[bucket].push(record);
        dashboardStats.markModified(`stats.records.${bucket}`);
        dashboardModified = true;
        return record;
      };

      const findUnrecoveredFailure = () => {
        return records.failure.find(r => r.picID === pic_id && r.deviceId === deviceId && r.recovered === false);
      };

      if (shouldHandleReprogrammingSuccess) {
        addRecord('other');
      } else if (alreadyUpdatedCase) {
        addRecord('other');
      } else if (lowerToUpper) {
        if (finalBadge === 'success') {
          const unrecoveredFailure = findUnrecoveredFailure();
          if (unrecoveredFailure) {
            unrecoveredFailure.recovered = true;
            dashboardStats.markModified('stats.records.failure');
            dashboardModified = true;
            await OTAUpdate.updateMany(
              { pic_id, deviceId, badge: 'failure', recovered: false },
              { $set: { recovered: true } }
            );
          }
          addRecord('success');
        } else if (finalBadge === 'failure') {
          const existingFailure = findUnrecoveredFailure();
          if (!existingFailure) {
            addRecord('failure', { recovered: false });
          }
        } else {
          addRecord('other');
        }
      }
    }

    if (dashboardStats && dashboardModified) {
      try {
        await dashboardStats.save();
        console.log('✅ Dashboard stats saved successfully');
      } catch (saveError) {
        console.error('❌ Error saving dashboard stats:', saveError);
        throw new Error(`Failed to save dashboard stats: ${saveError.message}`);
      }
    }

    res.status(200).json({
      success: true,
      message: 'OTA update report processed successfully',
      data: {
        otaUpdate: otaUpdate,
        dashboardStats: dashboardStats,
        updateType: finalBadge,
        badge: finalBadge,
        reprogramming: isReprogramming,
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

Router.get('/versions', async (req, res) => {
  try {
    const { deviceId, projectId, badge } = req.query;

    // Build base query similar to main listing
    let baseQuery = {};

    if (deviceId) {
      baseQuery.deviceId = deviceId;
    }

    // If projectId provided, fetch deviceIds in that project and restrict
    if (projectId) {
      const deviceIds = await Device.find({ project: projectId }).distinct('deviceId');
      if (!deviceIds || deviceIds.length === 0) {
        return res.status(200).json({
          success: true,
          versions: []
        });
      }
      baseQuery.deviceId = { $in: deviceIds };
    }

    // Determine which version field to get based on badge filter
    let versionField = 'updatedVersion';
    if (badge === 'failure') {
      versionField = 'previousVersion';
    }

    // Get distinct versions for the appropriate field
    const versions = await OTAUpdate.distinct(versionField, baseQuery);
    
    // Filter out null/empty values and sort
    const cleanVersions = versions
      .filter(v => v && v.trim() !== '')
      .sort()
      .map(version => ({
        value: version,
        label: version
      }));

    res.status(200).json({
      success: true,
      versions: cleanVersions
    });

  } catch (error) {
    console.error('Error retrieving versions:', error);
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
      versionQuery    // optional: string to search versions
    } = req.query;

    let baseQuery = {};

    // --- Handle projectId filter ---
    let projectDeviceIds = [];
    if (projectId) {
      projectDeviceIds = await Device.find({ project: projectId }).distinct('deviceId');
      if (!projectDeviceIds || projectDeviceIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 },
          counts: { success: 0, failure: 0, other: 0, total: 0 }
        });
      }
    }

    // --- Merge deviceId + projectId filters ---
    if (deviceId && projectId) {
      // only include if this device actually belongs to that project
      if (projectDeviceIds.includes(deviceId)) {
        baseQuery.deviceId = deviceId;
      } else {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 },
          counts: { success: 0, failure: 0, other: 0, total: 0 }
        });
      }
    } else if (projectId) {
      baseQuery.deviceId = { $in: projectDeviceIds };
    } else if (deviceId) {
      baseQuery.deviceId = deviceId;
    }

    // --- Version filtering ---
    let versionField = 'updatedVersion';
    if (badge === 'failure') versionField = 'previousVersion';

    const countsBaseQuery = { ...baseQuery };
    if (versionQuery && versionQuery.trim() !== '') {
      countsBaseQuery[versionField] = { $regex: versionQuery.trim(), $options: 'i' };
    }

    const pageQuery = { ...baseQuery };
    if (badge && badge !== 'all') {
      pageQuery.badge = badge;
    }
    if (versionQuery && versionQuery.trim() !== '') {
      pageQuery[versionField] = { $regex: versionQuery.trim(), $options: 'i' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // --- Data + counts ---
    const [updates, total, successCount, failureCount, otherCount] = await Promise.all([
      OTAUpdate.find(pageQuery).sort({ timestamp: -1, createdAt: -1 }).limit(parseInt(limit)).skip(skip).lean(),
      OTAUpdate.countDocuments(pageQuery),
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
