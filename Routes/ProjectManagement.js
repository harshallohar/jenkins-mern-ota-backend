const Router = require('express').Router();
const Project = require('../Models/ProjectModel');
const { authenticate, requireAdmin } = require('../Middleware/auth');
const ActivityLogger = require('../Services/ActivityLogger');

// Create a new project
Router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { projectName, projectDescription, devices } = req.body;
    // Validate devices are not already assigned
    if (devices && devices.length > 0) {
      const Device = require('../Models/DeviceModel');
      const alreadyAssigned = await Device.find({ _id: { $in: devices }, project: { $ne: null } });
      if (alreadyAssigned.length > 0) {
        return res.status(400).json({ error: 'Some devices are already assigned to another project.' });
      }
    }
    // Create project
    const project = new Project({ projectName, projectDescription, devices });
    await project.save();
    
    // Log project creation activity
    try {
      await ActivityLogger.logProjectCreated(
        req.user.id,
        project._id,
        projectName,
        {
          projectDescription,
          deviceCount: devices?.length || 0,
          createdBy: req.user.name
        }
      );
    } catch (activityError) {
      console.error('Error logging project creation activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    // Assign devices to this project
    if (devices && devices.length > 0) {
      const Device = require('../Models/DeviceModel');
      await Device.updateMany(
        { _id: { $in: devices } },
        { project: project._id, dateAssigned: new Date() }
      );
    }
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all projects
Router.get('/', require('../Middleware/auth').authenticate, async (req, res) => {
  try {
    let projects;
    if (req.user.role === 'admin') {
      projects = await Project.find();
    } else {
      projects = await Project.find({ _id: { $in: req.user.projects || [] } });
    }
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single project by ID
Router.get('/:id', require('../Middleware/auth').authenticate, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    // Check if user has access to this project
    if (req.user.role !== 'admin' && (!req.user.projects || !req.user.projects.includes(project._id.toString()))) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to view this project.' });
    }
    
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a project
Router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { projectName, projectDescription, devices } = req.body;
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // If devices are being updated
    if (devices) {
      const Device = require('../Models/DeviceModel');
      // Find devices currently assigned to this project
      const currentlyAssigned = await Device.find({ project: project._id });
      const currentlyAssignedIds = currentlyAssigned.map(d => d._id.toString());
      // Devices to remove (no longer assigned)
      const toRemove = currentlyAssignedIds.filter(id => !devices.includes(id));
      // Devices to add (newly assigned)
      const toAdd = devices.filter(id => !currentlyAssignedIds.includes(id));
      // Validate new devices are not already assigned
      if (toAdd.length > 0) {
        const alreadyAssigned = await Device.find({ _id: { $in: toAdd }, project: { $ne: null } });
        if (alreadyAssigned.length > 0) {
          return res.status(400).json({ error: 'Some devices are already assigned to another project.' });
        }
      }
      // Remove project assignment from removed devices
      await Device.updateMany({ _id: { $in: toRemove } }, { project: null, dateAssigned: null });
      // Assign project to new devices
      await Device.updateMany({ _id: { $in: toAdd } }, { project: project._id, dateAssigned: new Date() });
      // Update project's devices field
      project.devices = devices;
    }
    // Update other fields
    if (projectName !== undefined) project.projectName = projectName;
    if (projectDescription !== undefined) project.projectDescription = projectDescription;
    await project.save();
    
    // Log project update activity
    try {
      await ActivityLogger.logProjectUpdated(
        req.user.id,
        project._id,
        projectName || project.projectName,
        {
          projectDescription: projectDescription || project.projectDescription,
          deviceCount: devices?.length || project.devices?.length || 0,
          updatedBy: req.user.name,
          changes: {
            nameChanged: projectName !== undefined,
            descriptionChanged: projectDescription !== undefined,
            devicesChanged: devices !== undefined
          }
        }
      );
    } catch (activityError) {
      console.error('Error logging project update activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    res.json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a project
Router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    // Remove project assignment from all devices assigned to this project
    const Device = require('../Models/DeviceModel');
    await Device.updateMany(
      { project: project._id },
      { project: null, dateAssigned: null }
    );
    
    // Remove project assignment from all users assigned to this project
    const User = require('../Models/UserModel');
    await User.updateMany(
      { projects: project._id },
      { $pull: { projects: project._id } }
    );
    
    // Handle status management entries that might be affected
    const StatusManagement = require('../Models/StatusManagementModel');
    // Find devices that were in this project
    const projectDevices = await Device.find({ project: project._id }).select('deviceId');
    const projectDeviceIds = projectDevices.map(d => d.deviceId);
    
    // Update status management entries for devices that were in the deleted project
    // to remove any inherited status references to other devices in the same project
    await StatusManagement.updateMany(
      { 
        deviceId: { $in: projectDeviceIds },
        isBasedOnOtherDevice: true,
        baseDeviceId: { $in: projectDeviceIds }
      },
      { 
        isBasedOnOtherDevice: false,
        baseDeviceId: null,
        baseDeviceName: null
      }
    );
    
    // Now delete the project
    await Project.findByIdAndDelete(req.params.id);
    
    // Log project deletion activity
    try {
      await ActivityLogger.logBulkOperation(
        req.user.id,
        'Project Deletion',
        1,
        {
          projectId: project._id,
          projectName: project.projectName,
          deviceCount: project.devices?.length || 0,
          deletedBy: req.user.name
        }
      );
    } catch (activityError) {
      console.error('Error logging project deletion activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = Router; 