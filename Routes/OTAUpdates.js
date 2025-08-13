const Router = require('express').Router();
const OTAUpdate = require('../Models/OTAUpdateModel');
const StatusManagement = require('../Models/StatusManagementModel');
const Device = require('../Models/DeviceModel');
const DeviceStatsService = require('../Services/DeviceStatsService');

// Helper: map raw status code to message/badge/color using StatusManagement
async function resolveStatusForDevice(deviceId, rawStatus) {
  const statusEntry = await StatusManagement.findOne({ deviceId });
  let message = String(rawStatus);
  let badge = 'other';
  let color = undefined;

  const code = parseInt(rawStatus);
  
  // Check if status indicates "already updated" - treat as success
  if (message.toLowerCase().includes('already updated') || 
      message.toLowerCase().includes('already up to date') ||
      message.toLowerCase().includes('no update needed') ||
      message.toLowerCase().includes('firmware already current') ||
      message.toLowerCase().includes('version already installed') ||
      message.toLowerCase().includes('no update required') ||
      message.toLowerCase().includes('current version running')) {
    badge = 'success';
    color = '#16a34a'; // Green color for success
  }
  // Check if status indicates "up to date" - treat as success
  else if (message.toLowerCase().includes('up to date') ||
           message.toLowerCase().includes('current version')) {
    badge = 'success';
    color = '#16a34a'; // Green color for success
  }
  // Check if status indicates "successful update" - treat as success
  else if (message.toLowerCase().includes('success') ||
           message.toLowerCase().includes('updated successfully') ||
           message.toLowerCase().includes('update complete') ||
           message.toLowerCase().includes('update finished') ||
           message.toLowerCase().includes('installation complete') ||
           message.toLowerCase().includes('firmware installed') ||
           message.toLowerCase().includes('update successful')) {
    badge = 'success';
    color = '#16a34a'; // Green color for success
  }
  // Check if status indicates "update failed" - treat as failure
  else if (message.toLowerCase().includes('failed') ||
           message.toLowerCase().includes('error') ||
           message.toLowerCase().includes('update failed')) {
    badge = 'failure';
    color = '#dc2626'; // Red color for failure
  }
  // Check if status indicates "in progress" or "pending" - treat as other
  else if (message.toLowerCase().includes('in progress') ||
           message.toLowerCase().includes('pending') ||
           message.toLowerCase().includes('downloading') ||
           message.toLowerCase().includes('installing')) {
    badge = 'other';
    color = '#f59e0b'; // Amber color for in progress
  }
  
  // If we have a numeric status code and StatusManagement configuration, use that
  if (statusEntry && statusEntry.statusCodes && !isNaN(code)) {
    const match = statusEntry.statusCodes.find(sc => sc.code === code);
    if (match) {
      message = match.message;
      badge = match.badge || badge; // Use configured badge if available, otherwise keep our logic
      color = match.color || color; // Use configured color if available, otherwise keep our logic
    }
  }
  
  // Fallback: if we have a numeric code, use the existing logic (2 or 3 = success)
  if (!isNaN(code)) {
    if (code === 2 || code === 3) {
      badge = 'success';
      color = '#16a34a';
    } else if (code === 0 || code === 1) {
      badge = 'failure';
      color = '#dc2626';
    }
  }
  
  return { message, badge, color };
}

// Ingest report from ESP32
// POST /ota-updates/
// Body: { pic_id, deviceId, status, previousVersion, updatedVersion, date? }
Router.post('/', async (req, res) => {
  try {
    const { pic_id, deviceId, status, previousVersion, updatedVersion, date } = req.body || {};
    if (!pic_id || !deviceId || !status || !previousVersion || !updatedVersion) {
      return res.status(400).json({ message: 'pic_id, deviceId, status, previousVersion, updatedVersion are required' });
    }

    const entryDate = date ? new Date(date) : new Date();
    if (date && isNaN(entryDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const { message, badge, color } = await resolveStatusForDevice(deviceId, status);

    // Find existing record for this PIC and target version, else create
    let record = await OTAUpdate.findOne({ pic_id, updatedVersion });
    if (!record) {
      record = new OTAUpdate({
        pic_id,
        deviceId,
        previousVersion,
        updatedVersion,
        date: entryDate
      });
    }

    // Append status entry with resolved message and badge/color
    record.addStatusEntry(status, message, entryDate, badge, color);
    await record.save();

    // Update device-level stats and ESP-level stats
    try { await DeviceStatsService.updateDeviceStats(deviceId); } catch (_) {}
    try { await DeviceStatsService.updateESPStats(deviceId); } catch (_) {}

    return res.status(201).json({
      message: 'OTA update ingested',
      data: record
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Duplicate PIC/version record' });
    }
    return res.status(500).json({ message: 'Error ingesting OTA update', error: err.message });
  }
});

// Cards summary for OTAUpdates page (total success/failure/other by attempts)
Router.get('/cards-summary', async (req, res) => {
  try {
    const { deviceId } = req.query;
    const filter = {};
    if (deviceId) filter.deviceId = deviceId;
    const updates = await OTAUpdate.find(filter);

    let success = 0, failure = 0, other = 0, total = 0;
    updates.forEach(u => {
      u.statusEntries.forEach(e => {
        total += 1;
        if (e.badge === 'success') success += 1;
        else if (e.badge === 'failure') failure += 1;
        else other += 1;
      });
    });

    return res.json({ success, failure, other, total });
  } catch (err) {
    return res.status(500).json({ message: 'Error computing cards summary', error: err.message });
  }
});

// Daily unique counts for dashboard with dedup: success overrides failure within same day
// Query: startDate, endDate, projectId?, deviceId?
Router.get('/daily-unique-stats', async (req, res) => {
  try {
    const { startDate, endDate, projectId, deviceId } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().toISOString().slice(0,10));
    const end = endDate ? new Date(endDate) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate or endDate' });
    }

    // If projectId is present, restrict allowed deviceIds to devices in that project
    let allowedDeviceIds = null;
    if (projectId) {
      const projectDevices = await Device.find({ project: projectId }, { deviceId: 1 });
      allowedDeviceIds = new Set(projectDevices.map(d => d.deviceId));
    }

    // Fetch records that have any statusEntries within the date range.
    // This ensures older records whose lastUpdated is outside the range are still considered.
    const findFilter = {
      statusEntries: { $elemMatch: { date: { $gte: start, $lte: end } } }
    };
    if (deviceId) {
      findFilter.deviceId = deviceId;
    } else if (allowedDeviceIds) {
      findFilter.deviceId = { $in: Array.from(allowedDeviceIds) };
    }
    const all = await OTAUpdate.find(findFilter);

    // Expand to attempt-level entries carrying their dates and PIC IDs
    const entries = [];
    all.forEach(update => {
      if (allowedDeviceIds && !allowedDeviceIds.has(update.deviceId)) return;
      update.statusEntries.forEach(entry => {
        const d = entry.date ? new Date(entry.date) : new Date(update.lastUpdated);
        if (d >= start && d <= end) {
          entries.push({
            deviceId: update.deviceId,
            pic_id: update.pic_id,
            updatedVersion: update.updatedVersion,
            date: d,
            badge: entry.badge || 'other'
          });
        }
      });
    });

    // Prepare day buckets
    const byDay = new Map();
    entries.forEach(e => {
      const dayKey = new Date(Date.UTC(e.date.getUTCFullYear(), e.date.getUTCMonth(), e.date.getUTCDate())).toISOString().slice(0,10);
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey).push(e);
    });

    // For each day, count unique successes per (PIC_ID, updatedVersion).
    // If a PIC has failures/others earlier and later succeeds in the same day (any version),
    // drop those earlier non-success entries for that day.
    const daily = [];

    // Iterate through every day in range to include zero-activity days
    const walkDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    while (walkDate <= endDay) {
      const dayKey = new Date(Date.UTC(
        walkDate.getUTCFullYear(),
        walkDate.getUTCMonth(),
        walkDate.getUTCDate()
      )).toISOString().slice(0,10);
      const list = byDay.get(dayKey) || [];

      // Track last success time per PIC in this day
      const lastSuccessByPic = new Map(); // pic_id -> Date
      list.forEach(e => {
        // Treat "already updated" as success for counting purposes
        if (e.badge === 'success' || e.badge === 'other') {
          const prev = lastSuccessByPic.get(e.pic_id);
          if (!prev || e.date > prev) lastSuccessByPic.set(e.pic_id, e.date);
        }
      });

      // Track the last outcome for each (pic_id, updatedVersion) tuple
      const lastByTuple = new Map(); // key: pic|version -> { badge, date, deviceId }
      list.forEach(e => {
        const key = `${e.pic_id}|${e.updatedVersion}`;
        const prev = lastByTuple.get(key);
        if (!prev || e.date > prev.date) {
          lastByTuple.set(key, { badge: e.badge, date: e.date, deviceId: e.deviceId });
        }
      });

      let success = 0, failure = 0, total = 0;
      const successDevices = new Set();
      const failureDevices = new Set();
      lastByTuple.forEach((val, key) => {
        const [picId] = key.split('|');
        const lastSucc = lastSuccessByPic.get(picId);
        
        // If there is a later success for this PIC and this tuple's final outcome
        // happened before that success and is not success, drop it
        if (val.badge !== 'success' && val.badge !== 'other' && lastSucc && val.date < lastSucc) {
          return;
        }
        
        total += 1;
        // Treat "other" (including "already updated") as success for counting
        if (val.badge === 'success' || val.badge === 'other') { 
          success += 1; 
          successDevices.add(val.deviceId); 
        }
        else if (val.badge === 'failure') { 
          failure += 1; 
          failureDevices.add(val.deviceId); 
        }
      });

      daily.push({ 
        date: dayKey, 
        success, 
        failure, 
        total,
        successDevices: Array.from(successDevices),
        failureDevices: Array.from(failureDevices)
      });

      // next day
      walkDate.setUTCDate(walkDate.getUTCDate() + 1);
    }

    return res.json({ range: { start: start.toISOString(), end: end.toISOString() }, daily });
  } catch (err) {
    return res.status(500).json({ message: 'Error computing daily unique stats', error: err.message });
  }
});

// List OTA updates (optionally by deviceId)
Router.get('/', async (req, res) => {
  try {
    const { deviceId } = req.query;
    const filter = deviceId ? { deviceId } : {};
    const updates = await OTAUpdate.find(filter).sort({ lastUpdated: -1 });
    return res.json(updates);
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching updates', error: err.message });
  }
});

// Flattened attempts view for terminal-like history (do not apply dashboard dedup rules)
// GET /ota-updates/attempts?deviceId=&projectId=
Router.get('/attempts', async (req, res) => {
  try {
    const { deviceId, projectId } = req.query;

    // Build base filter
    const baseFilter = deviceId ? { deviceId } : {};
    const updates = await OTAUpdate.find(baseFilter).sort({ lastUpdated: -1 });

    // Optional project filter needs device lookup
    let allowedDeviceIds = null;
    if (projectId) {
      const projectDevices = await Device.find({ project: projectId }, { deviceId: 1 });
      allowedDeviceIds = new Set(projectDevices.map(d => d.deviceId));
    }

    const attempts = [];
    updates.forEach(update => {
      if (allowedDeviceIds && !allowedDeviceIds.has(update.deviceId)) return;
      (update.statusEntries || []).forEach((entry, idx) => {
        attempts.push({
          attemptId: `${update._id}:${entry.attemptNumber || idx + 1}`,
          recordId: update._id,
          deviceId: update.deviceId,
          pic_id: update.pic_id,
          previousVersion: update.previousVersion,
          updatedVersion: update.updatedVersion,
          status: entry.status,
          statusMessage: entry.statusMessage,
          badge: entry.badge || 'other',
          color: entry.color,
          date: entry.date || update.lastUpdated,
          attemptNumber: entry.attemptNumber || idx + 1
        });
      });
    });

    // Sort newest first by date
    attempts.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.json(attempts);
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching attempts', error: err.message });
  }
});

// Delete an OTA update by id
Router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await OTAUpdate.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    return res.json({ message: 'Deleted', id });
  } catch (err) {
    return res.status(500).json({ message: 'Error deleting', error: err.message });
  }
});

module.exports = Router;
// Additional dashboard stats endpoints for convenience/compatibility

// Total PIC experiences across ESPs in range (success/failure totals)
Router.get('/dashboard-esp-stats', async (req, res) => {
  try {
    const { startDate, endDate, projectId } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().toISOString().slice(0,10));
    const end = endDate ? new Date(endDate) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate or endDate' });
    }
    const stats = await DeviceStatsService.getDashboardESPStats(start, end, projectId || null);
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ message: 'Error computing dashboard ESP stats', error: err.message });
  }
});

Router.get('/daily-device-stats', async (req, res) => {
  try {
    const { startDate, endDate, projectId } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().toISOString().slice(0,10));
    const end = endDate ? new Date(endDate) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate or endDate' });
    }
    const stats = await DeviceStatsService.getDailyDeviceStats(start, end, projectId || null);
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ message: 'Error computing daily device stats', error: err.message });
  }
});

Router.get('/weekly-device-stats', async (req, res) => {
  try {
    const { startDate, endDate, projectId } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().toISOString().slice(0,10));
    const end = endDate ? new Date(endDate) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate or endDate' });
    }
    const stats = await DeviceStatsService.getWeeklyDeviceStats(start, end, projectId || null);
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ message: 'Error computing weekly device stats', error: err.message });
  }
});


