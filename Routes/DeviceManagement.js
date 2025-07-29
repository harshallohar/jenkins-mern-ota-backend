const Router = require('express').Router();
const Device = require('../Models/DeviceModel');
const Project = require('../Models/ProjectModel');
const { authenticate, requireAdmin } = require('../Middleware/auth');

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
    res.status(200).json(device);
  } catch (err) {
    res.status(500).json({ message: 'Error assigning project', error: err.message });
  }
});

module.exports = Router; 