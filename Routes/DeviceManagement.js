const Router = require('express').Router();
const Device = require('../Models/DeviceModel');
const Project = require('../Models/ProjectModel');
const { authenticate, requireAdmin } = require('../Middleware/auth');
const ActivityLogger = require('../Services/ActivityLogger');

// Get all devices
Router.get('/', require('../Middleware/auth').authenticate, async (req, res) => {
  try {
    let devices;
    if (req.user.role === 'admin') {
      devices = await Device.find().sort({ dateCreated: -1 });
    } else {
      // Only show devices in user's assigned projects
      devices = await Device.find({ project: { $in: req.user.projects || [] } }).sort({ dateCreated: -1 });
    }
    res.status(200).json(devices);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching devices', error: err.message });
  }
});

// Add new device
Router.post('/', async (req, res) => {
  try {
    const { name, deviceId } = req.body;
    if (!name || !deviceId) return res.status(400).json({ message: 'Name and Device ID are required' });
    const newDevice = new Device({ name, deviceId });
    await newDevice.save();
    
    // Log activity for device creation
    try {
      // For now, we'll use a default user ID since we don't have user context in this route
      const defaultUserId = '507f1f77bcf86cd799439011'; // Default user ID for system activities
      await ActivityLogger.logDeviceAdded(
        defaultUserId,
        deviceId,
        name,
        {
          deviceId: newDevice._id,
          dateCreated: newDevice.dateCreated
        }
      );
    } catch (activityError) {
      console.error('Error logging activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    res.status(201).json(newDevice);
  } catch (err) {
    res.status(500).json({ message: 'Error adding device', error: err.message });
  }
});

// Edit device
Router.put('/:id', async (req, res) => {
  try {
    const { name, deviceId } = req.body;
    const updated = await Device.findByIdAndUpdate(
      req.params.id,
      { name, deviceId },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Device not found' });
    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Error updating device', error: err.message });
  }
});

// Delete device
Router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Device.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Device not found' });
    
    // Log activity for device deletion
    try {
      // For now, we'll use a default user ID since we don't have user context in this route
      const defaultUserId = '507f1f77bcf86cd799439011'; // Default user ID for system activities
      await ActivityLogger.logDeviceRemoved(
        defaultUserId,
        deleted.deviceId,
        deleted.name,
        {
          deviceId: deleted._id,
          deletedAt: new Date()
        }
      );
    } catch (activityError) {
      console.error('Error logging activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    res.status(200).json({ message: 'Device deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting device', error: err.message });
  }
});

// Assign a device to a project (admin only)
Router.put('/:id/assign-project', authenticate, requireAdmin, async (req, res) => {
  try {
    const { projectId } = req.body;
    const device = await Device.findByIdAndUpdate(
      req.params.id,
      { project: projectId, dateAssigned: new Date() },
      { new: true }
    );
    if (!device) return res.status(404).json({ message: 'Device not found' });
    
    // Log device assignment activity
    try {
      const project = await Project.findById(projectId);
      await ActivityLogger.logDeviceAssigned(
        req.user.id,
        device.deviceId,
        device.name,
        project?.projectName || 'Unknown Project',
        {
          deviceId: device._id,
          projectId,
          assignedBy: req.user.name,
          assignedAt: new Date()
        }
      );
    } catch (activityError) {
      console.error('Error logging device assignment activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    res.status(200).json(device);
  } catch (err) {
    res.status(500).json({ message: 'Error assigning project', error: err.message });
  }
});

module.exports = Router; 