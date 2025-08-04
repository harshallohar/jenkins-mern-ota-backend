const Router = require('express').Router();
const OTAUpdate = require('../Models/OTAUpdateModel');
const ActivityLogger = require('../Services/ActivityLogger');

// Get all OTA updates
Router.get('/', async (req, res) => {
  try {
    const updates = await OTAUpdate.find().sort({ date: -1 });
    res.status(200).json(updates);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching OTA updates', error: err.message });
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

// Add new OTA update
Router.post('/', async (req, res) => {
  try {
    const { pic_id, deviceId, status, previousVersion, updatedVersion, date } = req.body;
    if (!pic_id || !deviceId || !status || !previousVersion || !updatedVersion) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Normalize status
    let normalizedStatus = 'Failed';
    if (status === 'Programming Successfull') {
      normalizedStatus = 'Success';
    }else if (status === 'Programming Unsuccessfull') { //Programming Unsuccessful
      normalizedStatus = 'Failed';
    }
    
    // Handle date - use provided date or current time
    let updateDate;
    if (date) {
      // If date is provided, parse it
      updateDate = new Date(date);
      if (isNaN(updateDate.getTime())) {
        return res.status(400).json({ message: 'Invalid date format' });
      }
      console.log('=== USING PROVIDED DATE ===');
      console.log('Provided date string:', date);
      console.log('Parsed date object:', updateDate);
      console.log('Parsed date ISO:', updateDate.toISOString());
    } else {
      // Use current UTC time if no date provided
      // Get current UTC time explicitly to avoid timezone issues
      const now = new Date();
      const utcYear = now.getUTCFullYear();
      const utcMonth = now.getUTCMonth();
      const utcDay = now.getUTCDate();
      const utcHours = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();
      const utcSeconds = now.getUTCSeconds();
      
      updateDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHours, utcMinutes, utcSeconds));
      
      console.log('=== USING CURRENT SERVER DATE ===');
      console.log('Current server date object:', now);
      console.log('Current server date ISO:', now.toISOString());
      console.log('Current server date string:', now.toString());
      console.log('UTC components - Year:', utcYear, 'Month:', utcMonth + 1, 'Day:', utcDay, 'Hours:', utcHours);
      console.log('Date being used for update:', updateDate.toISOString());
    }
    
    // Ensure the date is in UTC
    const utcDate = new Date(updateDate.toISOString());
    console.log('=== FINAL DATE BEING SAVED ===');
    console.log('Final UTC date:', utcDate.toISOString());
    console.log('Final date object:', utcDate);
    console.log('Date parts - Year:', utcDate.getFullYear(), 'Month:', utcDate.getMonth() + 1, 'Day:', utcDate.getDate());
    
    const newUpdate = new OTAUpdate({ 
      pic_id, 
      deviceId, 
      status, 
      normalizedStatus, 
      previousVersion, 
      updatedVersion,
      date: utcDate
    });
    
    await newUpdate.save();
    
    // Log activity for OTA update
    try {
      // For now, we'll use a default user ID since we don't have user context in this route
      // In a real implementation, you'd get the user ID from the request
      const defaultUserId = '507f1f77bcf86cd799439011'; // Default user ID for system activities
      await ActivityLogger.logOTAUpdate(
        defaultUserId,
        deviceId,
        normalizedStatus,
        updatedVersion,
        {
          pic_id,
          previousVersion,
          originalStatus: status
        }
      );
    } catch (activityError) {
      console.error('Error logging activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    res.status(201).json(newUpdate);
  } catch (err) {
    res.status(500).json({ message: 'Error adding OTA update', error: err.message });
  }
});

// Delete OTA update
Router.delete('/:id', async (req, res) => {
  try {
    const deleted = await OTAUpdate.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'OTA update not found' });
    res.status(200).json({ message: 'OTA update deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting OTA update', error: err.message });
  }
});

module.exports = Router; 