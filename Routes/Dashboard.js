const Router = require('express').Router();
const DashboardStats = require('../Models/DashboardStatsModel');
const Device = require('../Models/DeviceModel');
const OTAUpdate = require('../Models/OTAUpdateModel');
const { authenticate } = require('../Middleware/auth');

/**
 * Helper: format a Date as local YYYY-MM-DD (uses local timezone)
 */
function formatLocalDateKey(date) {
  if (!date) return null;
  if (!(date instanceof Date)) date = new Date(date);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Helper: build local start/end Date objects from YYYY-MM-DD strings
 */
function parseLocalStart(dateStr) {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function parseLocalEnd(dateStr) {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function computeRecordCounts(records = {}) {
  const successRecords = Array.isArray(records.success) ? records.success : [];
  const failureRecords = Array.isArray(records.failure) ? records.failure : [];
  const otherRecords = Array.isArray(records.other) ? records.other : [];
  const activeFailures = failureRecords.filter(record => record && record.recovered === false);

  return {
    success: successRecords.length,
    failure: activeFailures.length,
    other: otherRecords.length,
    total: successRecords.length + activeFailures.length + otherRecords.length
  };
}

/**
 * GET: Get dashboard statistics for a specific device and date
 */
Router.get('/stats/:deviceId', authenticate, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;

    // Parse date or use today: convert to local midnight Date object
    let targetDate;
    if (date) {
      const parsed = new Date(date);
      targetDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
    } else {
      const t = new Date();
      targetDate = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0, 0);
    }

    // Find dashboard stats for the device and date
    const dashboardStats = await DashboardStats.findOne({
      deviceId: deviceId,
      'stats.date': targetDate
    });

    if (!dashboardStats) {
      // Return empty stats if none exist
      return res.status(200).json({
        success: true,
        data: {
          deviceId: deviceId,
          date: formatLocalDateKey(targetDate),
          stats: {
            success: 0,
            failure: 0,
            other: 0,
            total: 0
          },
          records: {
            success: [],
            failure: [],
            other: []
          }
        }
      });
    }

    // Calculate summary statistics
    const { success: successCount, failure: failureCount, other: otherCount, total: totalCount } =
      computeRecordCounts(dashboardStats.stats.records);

    // Return date as local YYYY-MM-DD string
    const dateStr = formatLocalDateKey(dashboardStats.stats.date);

    res.status(200).json({
      success: true,
      data: {
        deviceId: dashboardStats.deviceId,
        date: dateStr,
        stats: {
          success: successCount,
          failure: failureCount,
          other: otherCount,
          total: totalCount
        },
        records: dashboardStats.stats.records || { success: [], failure: [], other: [] }
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * GET: Get dashboard statistics for all devices on a specific date
 */
Router.get('/stats', authenticate, async (req, res) => {
  try {
    const { date, projectId } = req.query;

    // Parse date or use today (local midnight)
    let targetDate;
    if (date) {
      const parsed = new Date(date);
      targetDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
    } else {
      const t = new Date();
      targetDate = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0, 0);
    }

    // Build query
    let query = { 'stats.date': targetDate };

    // If projectId is provided, filter by devices in that project
    if (projectId) {
      const projectDevices = await Device.find({ project: projectId }).select('deviceId');
      const deviceIds = projectDevices.map(d => d.deviceId);
      query.deviceId = { $in: deviceIds };
    }

    // Find all dashboard stats for the date
    const allStats = await DashboardStats.find(query);

    // Aggregate statistics across all devices
    let totalSuccess = 0;
    let totalFailure = 0;
    let totalOther = 0;
    let totalRecords = 0;

    const deviceStats = allStats.map(stat => {
      const counts = computeRecordCounts(stat.stats.records);

      totalSuccess += counts.success;
      totalFailure += counts.failure;
      totalOther += counts.other;
      totalRecords += counts.total;

      return {
        deviceId: stat.deviceId,
        stats: counts
      };
    });

    res.status(200).json({
      success: true,
      data: {
        date: formatLocalDateKey(targetDate),
        overallStats: {
          success: totalSuccess,
          failure: totalFailure,
          other: totalOther,
          total: totalRecords
        },
        deviceStats: deviceStats
      }
    });

  } catch (error) {
    console.error('Error fetching overall dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * GET: Get total success and failure counts for charts
 */
// In your backend routes file, update the chart-data endpoint:

Router.get('/chart-data', authenticate, async (req, res) => {
  try {
    const { projectId, deviceId, days = 7 } = req.query;

    // Calculate date range using local timezone
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();

    // End date: today at 23:59:59.999 in local timezone (inclusive)
    const endDate = new Date(year, month, day, 23, 59, 59, 999);

    // Start date: subtract (days - 1) so "last N days" includes today
    const startDate = new Date(year, month, day - parseInt(days) + 1, 0, 0, 0, 0);

    console.log(`📅 Chart data: Days requested: ${days}`);
    console.log(`📅 Chart data: Start date (local): ${startDate.toISOString()} (${formatLocalDateKey(startDate)})`);
    console.log(`📅 Chart data: End date (local): ${endDate.toISOString()} (${formatLocalDateKey(endDate)})`);

    // Build query
    let query = {
      'stats.date': { $gte: startDate, $lte: endDate }
    };

    // FIXED: Handle device filtering properly
    if (deviceId) {
      // If specific device is selected, filter by deviceId only
      query.deviceId = deviceId;
      console.log(`📅 Filtering by specific device: ${deviceId}`);
    } else if (projectId) {
      // If only project is selected, filter by all devices in that project
      const projectDevices = await Device.find({ project: projectId }).select('deviceId');
      const deviceIds = projectDevices.map(d => d.deviceId);
      if (deviceIds.length > 0) {
        query.deviceId = { $in: deviceIds };
        console.log(`📅 Filtering by project devices: ${deviceIds.join(', ')}`);
      } else {
        console.log(`📅 No devices found for project: ${projectId}`);
      }
    }

    // Find all dashboard stats in the date range
    const allStats = await DashboardStats.find(query).sort({ 'stats.date': 1 });

    console.log(`📅 Found ${allStats.length} dashboard stats records`);

    // ... rest of the function remains the same
    
    // Aggregate total counts
    let totalSuccess = 0;
    let totalFailure = 0;
    let totalOther = 0;

    // Prepare daily data for bar chart
    const dailyData = [];
    const dateMap = new Map();

    // Initialize all dates in range with zero counts (use local date keys)
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = formatLocalDateKey(d);
      dateMap.set(dateKey, {
        date: dateKey,
        success: 0,
        failure: 0,
        other: 0,
        total: 0
      });
    }

    // Aggregate data from stats
    allStats.forEach(stat => {
      const counts = computeRecordCounts(stat.stats.records);

      totalSuccess += counts.success;
      totalFailure += counts.failure;
      totalOther += counts.other;

      // Add to daily data using local date key
      const dateKey = formatLocalDateKey(stat.stats.date);
      if (dateMap.has(dateKey)) {
        const daily = dateMap.get(dateKey);
        daily.success += counts.success;
        daily.failure += counts.failure;
        daily.other += counts.other;
        daily.total += counts.total;
      } else {
        dateMap.set(dateKey, {
          date: dateKey,
          success: counts.success,
          failure: counts.failure,
          other: counts.other,
          total: counts.total
        });
      }
    });

    // Convert map to array and sort by date (ascending)
    dailyData.push(...dateMap.values());
    dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Prepare pie chart data
    const pieChartData = [
      { label: 'Success', value: totalSuccess, color: '#10B981' },
      { label: 'Failure', value: totalFailure, color: '#EF4444' },
      { label: 'Other', value: totalOther, color: '#F59E0B' }
    ];

    res.status(200).json({
      success: true,
      data: {
        dateRange: {
          start: formatLocalDateKey(startDate),
          end: formatLocalDateKey(endDate),
          days: parseInt(days)
        },
        totalCounts: {
          success: totalSuccess,
          failure: totalFailure,
          other: totalOther,
          total: totalSuccess + totalFailure + totalOther
        },
        barChartData: dailyData,
        pieChartData: pieChartData
      }
    });

  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * NEW: GET: Export detailed records (per-device, per-date) for CSV export
 * Accepts: projectId (optional), deviceId (optional), startDate, endDate OR days (predefined)
 * Returns: data.rows -> array of { date, deviceId, outcome, picID, previousVersion, updatedVersion, timestamp }
 */
Router.get('/export', authenticate, async (req, res) => {
  try {
    const { projectId, deviceId, startDate, endDate, days } = req.query;

    // Determine startLocal and endLocal
    let startLocal, endLocal;
    if (startDate && endDate) {
      startLocal = parseLocalStart(startDate);
      endLocal = parseLocalEnd(endDate);
    } else if (days) {
      // compute based on days
      const today = new Date();
      const y = today.getFullYear();
      const m = today.getMonth();
      const d = today.getDate();
      endLocal = new Date(y, m, d, 23, 59, 59, 999);
      startLocal = new Date(y, m, d - parseInt(days) + 1, 0, 0, 0, 0);
    } else {
      // default last 7 days
      const today = new Date();
      const y = today.getFullYear();
      const m = today.getMonth();
      const d = today.getDate();
      endLocal = new Date(y, m, d, 23, 59, 59, 999);
      startLocal = new Date(y, m, d - 7 + 1, 0, 0, 0, 0);
    }

    // Build query: find stats rows whose stats.date is within range
    let query = {
      'stats.date': { $gte: startLocal, $lte: endLocal }
    };

    // project/device filters
    if (projectId && !deviceId) {
      const projectDevices = await Device.find({ project: projectId }).select('deviceId');
      const deviceIds = projectDevices.map(d => d.deviceId);
      query.deviceId = { $in: deviceIds };
    } else if (deviceId) {
      query.deviceId = deviceId;
    }

    // Fetch matching DashboardStats documents
    const stats = await DashboardStats.find(query).sort({ 'stats.date': 1 });

    // Assemble detailed rows
    const rows = []; // each row includes recovered state for clarity
    stats.forEach(stat => {
      const dateKey = formatLocalDateKey(stat.stats.date);
      const devId = stat.deviceId;

      // success records
      (stat.stats.records?.success || []).forEach(r => {
        rows.push({
          date: dateKey,
          deviceId: devId,
          outcome: 'success',
          picID: r.picID || r.picId || r.picId, // defensive names
          previousVersion: r.previousVersion,
          updatedVersion: r.updatedVersion,
          recovered: typeof r.recovered === 'boolean' ? r.recovered : true,
          timestamp: (r.timestamp instanceof Date) ? r.timestamp.toISOString() : new Date(r.timestamp).toISOString()
        });
      });

      // failure records
      (stat.stats.records?.failure || []).forEach(r => {
        rows.push({
          date: dateKey,
          deviceId: devId,
          outcome: 'failure',
          picID: r.picID || r.picId,
          previousVersion: r.previousVersion,
          updatedVersion: r.updatedVersion,
          recovered: typeof r.recovered === 'boolean' ? r.recovered : false,
          timestamp: (r.timestamp instanceof Date) ? r.timestamp.toISOString() : new Date(r.timestamp).toISOString()
        });
      });

      // other records
      (stat.stats.records?.other || []).forEach(r => {
        rows.push({
          date: dateKey,
          deviceId: devId,
          outcome: 'other',
          picID: r.picID || r.picId,
          previousVersion: r.previousVersion,
          updatedVersion: r.updatedVersion,
          recovered: typeof r.recovered === 'boolean' ? r.recovered : true,
          timestamp: (r.timestamp instanceof Date) ? r.timestamp.toISOString() : new Date(r.timestamp).toISOString()
        });
      });
    });

    // Return rows sorted by date then device then timestamp
    rows.sort((a, b) => {
      if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
      if (a.deviceId !== b.deviceId) return a.deviceId.localeCompare(b.deviceId);
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    res.status(200).json({
      success: true,
      data: {
        start: formatLocalDateKey(startLocal),
        end: formatLocalDateKey(endLocal),
        rows: rows
      }
    });
  } catch (error) {
    console.error('Error exporting detailed dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * GET: Get time-based statistics for custom date ranges
 */
Router.get('/time-stats', authenticate, async (req, res) => {
  try {
    const { projectId, deviceId, startDate, endDate } = req.query;

    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required parameters'
      });
    }

    // Parse dates and convert to local timezone (start of day and end of day)
    const startParsed = new Date(startDate);
    const endParsed = new Date(endDate);

    if (isNaN(startParsed.getTime()) || isNaN(endParsed.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)'
      });
    }

    // Set time boundaries using local timezone
    const startLocal = new Date(startParsed.getFullYear(), startParsed.getMonth(), startParsed.getDate(), 0, 0, 0, 0);
    const endLocal = new Date(endParsed.getFullYear(), endParsed.getMonth(), endParsed.getDate(), 23, 59, 59, 999);

    console.log(`📅 Time-stats: Start date (local): ${startLocal.toISOString()} (${formatLocalDateKey(startLocal)})`);
    console.log(`📅 Time-stats: End date (local): ${endLocal.toISOString()} (${formatLocalDateKey(endLocal)})`);

    // Build query
    let query = {
      'stats.date': { $gte: startLocal, $lte: endLocal }
    };

    if (deviceId) {
      query.deviceId = deviceId;
    } else if (projectId) {
      const projectDevices = await Device.find({ project: projectId }).select('deviceId');
      const deviceIds = projectDevices.map(d => d.deviceId);
      query.deviceId = { $in: deviceIds };
    }

    // Find all dashboard stats in the date range
    const allStats = await DashboardStats.find(query).sort({ 'stats.date': 1 });

    // Aggregate total counts
    let totalSuccess = 0;
    let totalFailure = 0;
    let totalOther = 0;

    // Prepare daily data
    const dailyData = [];
    const dateMap = new Map();

    // Initialize all dates in range with zero counts using local keys
    for (let d = new Date(startLocal); d <= endLocal; d.setDate(d.getDate() + 1)) {
      const dateKey = formatLocalDateKey(d);
      dateMap.set(dateKey, {
        date: dateKey,
        success: 0,
        failure: 0,
        other: 0,
        total: 0
      });
    }

    // Aggregate data from stats
    allStats.forEach(stat => {
      const counts = computeRecordCounts(stat.stats.records);

      totalSuccess += counts.success;
      totalFailure += counts.failure;
      totalOther += counts.other;

      // Use local date key
      const dateKey = formatLocalDateKey(stat.stats.date);
      if (dateMap.has(dateKey)) {
        const daily = dateMap.get(dateKey);
        daily.success += counts.success;
        daily.failure += counts.failure;
        daily.other += counts.other;
        daily.total += counts.total;
      } else {
        dateMap.set(dateKey, {
          date: dateKey,
          success: counts.success,
          failure: counts.failure,
          other: counts.other,
          total: counts.total
        });
      }
    });

    // Convert map to array and sort by date
    dailyData.push(...dateMap.values());
    dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate success/failure rates
    const totalUpdates = totalSuccess + totalFailure + totalOther;
    const successRate = totalUpdates > 0 ? ((totalSuccess / totalUpdates) * 100).toFixed(2) : 0;
    const failureRate = totalUpdates > 0 ? ((totalFailure / totalUpdates) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        dateRange: {
          start: formatLocalDateKey(startLocal),
          end: formatLocalDateKey(endLocal),
          totalDays: Math.ceil((endLocal - startLocal) / (1000 * 60 * 60 * 24))
        },
        totalCounts: {
          success: totalSuccess,
          failure: totalFailure,
          other: totalOther,
          total: totalUpdates
        },
        rates: {
          successRate: parseFloat(successRate),
          failureRate: parseFloat(failureRate)
        },
        dailyData: dailyData
      }
    });

  } catch (error) {
    console.error('Error fetching time-based stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * GET: Get OTA updates for dashboard (recent updates with status info)
 */
Router.get('/ota-updates', authenticate, async (req, res) => {
  try {
    const { deviceId, limit = 50, page = 1, projectId } = req.query;

    let query = {};
    if (deviceId) {
      query.deviceId = deviceId;
    }

    // If projectId is provided, filter by devices in that project
    if (projectId && !deviceId) {
      const projectDevices = await Device.find({ project: projectId }).select('deviceId');
      const deviceIds = projectDevices.map(d => d.deviceId);
      query.deviceId = { $in: deviceIds };
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
    console.error('Error fetching OTA updates for dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * GET: Get dashboard summary for a specific device
 */
Router.get('/summary/:deviceId', authenticate, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { days = 7 } = req.query;

    // Calculate date range using local timezone
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();

    // End date: today at 23:59:59.999 in local timezone
    const endDate = new Date(year, month, day, 23, 59, 59, 999);

    // Start date: last (days) including today
    const startDate = new Date(year, month, day - parseInt(days) + 1, 0, 0, 0, 0);

    console.log(`📅 Summary: Days requested: ${days}`);
    console.log(`📅 Summary: Start date (local): ${startDate.toISOString()} (${formatLocalDateKey(startDate)})`);
    console.log(`📅 Summary: End date (local): ${endDate.toISOString()} (${formatLocalDateKey(endDate)})`);

    // Get dashboard stats for the date range
    const stats = await DashboardStats.find({
      deviceId: deviceId,
      'stats.date': { $gte: startDate, $lte: endDate }
    }).sort({ 'stats.date': 1 });

    // Get recent OTA updates
    const recentUpdates = await OTAUpdate.find({
      deviceId: deviceId
    })
      .sort({ timestamp: -1, createdAt: -1 })
      .limit(10);

    // Calculate daily statistics - return date as local YYYY-MM-DD string
    const dailyStats = stats.map(stat => {
      const counts = computeRecordCounts(stat.stats.records);
      return {
        date: formatLocalDateKey(stat.stats.date),
        success: counts.success,
        failure: counts.failure,
        other: counts.other,
        total: counts.total
      };
    });

    res.status(200).json({
      success: true,
      data: {
        deviceId: deviceId,
        dateRange: {
          start: formatLocalDateKey(startDate),
          end: formatLocalDateKey(endDate)
        },
        dailyStats: dailyStats,
        recentUpdates: recentUpdates
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * GET: Get device information for dashboard
 */
Router.get('/devices', authenticate, async (req, res) => {
  try {
    const { projectId } = req.query;

    let query = {};
    if (projectId) {
      query.project = projectId;
    }

    const devices = await Device.find(query).select('deviceId name project status');

    res.status(200).json({
      success: true,
      data: devices
    });

  } catch (error) {
    console.error('Error fetching devices for dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

Router.delete('/delete', authenticate, async (req, res) => {
  try {
    const { projectId, deviceId, startDate, endDate, days, confirm } = req.query;

    // Safety guard: require explicit confirm flag
    if (confirm !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Dangerous operation: must send confirm=true in query to allow deletion.'
      });
    }

    // Determine startLocal and endLocal
    let startLocal, endLocal;
    if (startDate && endDate) {
      // custom range provided
      startLocal = parseLocalStart(startDate);
      endLocal = parseLocalEnd(endDate);
    } else if (days) {
      // compute based on days (include today)
      const today = new Date();
      const y = today.getFullYear();
      const m = today.getMonth();
      const d = today.getDate();
      endLocal = new Date(y, m, d, 23, 59, 59, 999);
      startLocal = new Date(y, m, d - parseInt(days) + 1, 0, 0, 0, 0);
    } else {
      // default last 7 days
      const today = new Date();
      const y = today.getFullYear();
      const m = today.getMonth();
      const d = today.getDate();
      endLocal = new Date(y, m, d, 23, 59, 59, 999);
      startLocal = new Date(y, m, d - 7 + 1, 0, 0, 0, 0);
    }

    // Build query to delete DashboardStats documents whose stats.date is in range
    let query = {
      'stats.date': { $gte: startLocal, $lte: endLocal }
    };

    // If deviceId provided, restrict to that device
    if (deviceId) {
      query.deviceId = deviceId;
    } else if (projectId) {
      // filter devices by projectId
      const projectDevices = await Device.find({ project: projectId }).select('deviceId');
      const deviceIds = projectDevices.map(d => d.deviceId);
      // if no devices found for project, nothing to delete
      if (!deviceIds || deviceIds.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No devices found for provided projectId, nothing deleted.',
          deletedCount: 0,
          start: formatLocalDateKey(startLocal),
          end: formatLocalDateKey(endLocal)
        });
      }
      query.deviceId = { $in: deviceIds };
    }

    // Execute deletion
    const result = await DashboardStats.deleteMany(query);

    // result may contain deletedCount
    const deletedCount = result.deletedCount !== undefined ? result.deletedCount : (result.n || 0);

    // NOTE: we do NOT automatically delete OTAUpdate documents here.
    // If you want OTA updates removed too, we can add that behavior (dangerous).
    res.status(200).json({
      success: true,
      message: `Deleted ${deletedCount} DashboardStats documents.`,
      deletedCount,
      start: formatLocalDateKey(startLocal),
      end: formatLocalDateKey(endLocal)
    });
  } catch (error) {
    console.error('Error deleting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = Router;
