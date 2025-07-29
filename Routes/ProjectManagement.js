const Router = require('express').Router();
const Project = require('../Models/ProjectModel');

// Create a new project
Router.post('/', async (req, res) => {
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
Router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a project
Router.put('/:id', async (req, res) => {
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
    res.json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a project
Router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = Router; 