const express = require('express');
const router = express.Router();
const StatusManagement = require('../Models/StatusManagementModel');
const Device = require('../Models/DeviceModel');
const { authenticate } = require('../Middleware/auth');
const ActivityLogger = require('../Services/ActivityLogger');

const findDuplicateStatusCode = (codes = []) => {
  const seen = new Set();
  for (const code of codes) {
    if (!code || code.code === undefined || code.code === null) continue;
    const normalized = code.code.toString().trim();
    if (normalized === '') continue;
    if (seen.has(normalized)) {
      return normalized;
    }
    seen.add(normalized);
  }
  return null;
};

// Get all status management entries
router.get('/', authenticate, async (req, res) => {
  try {
    const statusEntries = await StatusManagement.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(statusEntries);
  } catch (error) {
    console.error('Error fetching status management entries:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get status management by device ID
router.get('/device/:deviceId', authenticate, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const statusEntry = await StatusManagement.findOne({ deviceId })
      .populate('createdBy', 'name email');
    
    if (!statusEntry) {
      return res.status(404).json({ message: 'Status management not found for this device' });
    }
    
    res.json(statusEntry);
  } catch (error) {
    console.error('Error fetching status management:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new status management entry
router.post('/', authenticate, async (req, res) => {
  try {
    const { deviceId, deviceName, statusCodes, isBasedOnOtherDevice, baseDeviceId, baseDeviceName } = req.body;
    
    // Check if device exists
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Check if status management already exists for this device
    const existingEntry = await StatusManagement.findOne({ deviceId });
    if (existingEntry) {
      return res.status(400).json({ message: 'Status management already exists for this device' });
    }
    
    // If based on other device, validate the base device
    if (isBasedOnOtherDevice && baseDeviceId) {
      const baseDevice = await Device.findOne({ deviceId: baseDeviceId });
      if (!baseDevice) {
        return res.status(404).json({ message: 'Base device not found' });
      }
      
      const baseStatusEntry = await StatusManagement.findOne({ deviceId: baseDeviceId });
      if (!baseStatusEntry) {
        return res.status(400).json({ message: 'Base device does not have status management configured' });
      }
    }
    
    if (!isBasedOnOtherDevice) {
      const duplicateCode = findDuplicateStatusCode(statusCodes);
      if (duplicateCode !== null) {
        return res.status(400).json({
          message: `Status code ${duplicateCode} is already defined for this device`
        });
      }
    }

    const statusManagement = new StatusManagement({
      deviceId,
      deviceName,
      statusCodes: statusCodes || [],
      isBasedOnOtherDevice,
      baseDeviceId,
      baseDeviceName,
      createdBy: req.user.id
    });
    
    await statusManagement.save();
    
    // Log activity
    await ActivityLogger.logActivity({
      user: req.user.id,
      action: 'CREATE',
      resource: 'StatusManagement',
      details: `Created status management for device: ${deviceName}`,
      resourceId: statusManagement._id
    });
    
    res.status(201).json(statusManagement);
  } catch (error) {
    console.error('Error creating status management:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update status management entry
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { deviceName, statusCodes, isBasedOnOtherDevice, baseDeviceId, baseDeviceName } = req.body;
    
    const statusManagement = await StatusManagement.findById(id);
    if (!statusManagement) {
      return res.status(404).json({ message: 'Status management not found' });
    }
    
    // If based on other device, validate the base device
    if (isBasedOnOtherDevice && baseDeviceId) {
      const baseDevice = await Device.findOne({ deviceId: baseDeviceId });
      if (!baseDevice) {
        return res.status(404).json({ message: 'Base device not found' });
      }
      
      const baseStatusEntry = await StatusManagement.findOne({ deviceId: baseDeviceId });
      if (!baseStatusEntry) {
        return res.status(400).json({ message: 'Base device does not have status management configured' });
      }
    }
    
    if (!isBasedOnOtherDevice && Array.isArray(statusCodes)) {
      const duplicateCode = findDuplicateStatusCode(statusCodes);
      if (duplicateCode !== null) {
        return res.status(400).json({
          message: `Status code ${duplicateCode} is already defined for this device`
        });
      }
    }

    // Update fields
    if (deviceName) statusManagement.deviceName = deviceName;
    if (statusCodes) statusManagement.statusCodes = statusCodes;
    statusManagement.isBasedOnOtherDevice = isBasedOnOtherDevice;
    if (baseDeviceId) statusManagement.baseDeviceId = baseDeviceId;
    if (baseDeviceName) statusManagement.baseDeviceName = baseDeviceName;
    
    await statusManagement.save();
    
    // Log activity
    await ActivityLogger.logActivity({
      user: req.user.id,
      action: 'UPDATE',
      resource: 'StatusManagement',
      details: `Updated status management for device: ${statusManagement.deviceName}`,
      resourceId: statusManagement._id
    });
    
    res.json(statusManagement);
  } catch (error) {
    console.error('Error updating status management:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete status management entry
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const statusManagement = await StatusManagement.findById(id);
    if (!statusManagement) {
      return res.status(404).json({ message: 'Status management not found' });
    }
    
    const deviceName = statusManagement.deviceName;
    await StatusManagement.findByIdAndDelete(id);
    
    // Log activity
    await ActivityLogger.logActivity({
      user: req.user.id,
      action: 'DELETE',
      resource: 'StatusManagement',
      details: `Deleted status management for device: ${deviceName}`,
      resourceId: id
    });
    
    res.json({ message: 'Status management deleted successfully' });
  } catch (error) {
    console.error('Error deleting status management:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Copy status codes from another device
router.post('/copy/:deviceId', authenticate, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { sourceDeviceId } = req.body;
    
    // Check if target device exists
    const targetDevice = await Device.findOne({ deviceId });
    if (!targetDevice) {
      return res.status(404).json({ message: 'Target device not found' });
    }
    
    // Check if source device exists and has status management
    const sourceStatusEntry = await StatusManagement.findOne({ deviceId: sourceDeviceId });
    if (!sourceStatusEntry) {
      return res.status(404).json({ message: 'Source device status management not found' });
    }
    
    // Check if target device already has status management
    let targetStatusEntry = await StatusManagement.findOne({ deviceId });
    
    if (targetStatusEntry) {
      // Update existing entry
      targetStatusEntry.statusCodes = sourceStatusEntry.statusCodes;
      targetStatusEntry.isBasedOnOtherDevice = true;
      targetStatusEntry.baseDeviceId = sourceDeviceId;
      targetStatusEntry.baseDeviceName = sourceStatusEntry.deviceName;
      await targetStatusEntry.save();
    } else {
      // Create new entry
      targetStatusEntry = new StatusManagement({
        deviceId,
        deviceName: targetDevice.name,
        statusCodes: sourceStatusEntry.statusCodes,
        isBasedOnOtherDevice: true,
        baseDeviceId: sourceDeviceId,
        baseDeviceName: sourceStatusEntry.deviceName,
        createdBy: req.user.id
      });
      await targetStatusEntry.save();
    }
    
    // Log activity
    await ActivityLogger.logActivity({
      user: req.user.id,
      action: 'COPY',
      resource: 'StatusManagement',
      details: `Copied status codes from ${sourceStatusEntry.deviceName} to ${targetDevice.name}`,
      resourceId: targetStatusEntry._id
    });
    
    res.json(targetStatusEntry);
  } catch (error) {
    console.error('Error copying status codes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get available devices for copying status codes
router.get('/devices/available', authenticate, async (req, res) => {
  try {
    const devices = await Device.find().select('deviceId name');
    const devicesWithStatus = await StatusManagement.find().select('deviceId deviceName');
    
    const availableDevices = devices.map(device => ({
      deviceId: device.deviceId,
      name: device.name,
      hasStatusManagement: devicesWithStatus.some(status => status.deviceId === device.deviceId)
    }));
    
    res.json(availableDevices);
  } catch (error) {
    console.error('Error fetching available devices:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router; 