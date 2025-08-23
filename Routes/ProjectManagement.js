const Router = require('express').Router();
const Project = require('../Models/ProjectModel');
const { authenticate, requireAdmin } = require('../Middleware/auth');
const ActivityLogger = require('../Services/ActivityLogger');
const Device = require('../Models/DeviceModel');
const User = require('../Models/UserModel');
const StatusManagement = require('../Models/StatusManagementModel');

/*
  Helper: escape CSV cell
*/
function csvCell(val) {
  if (val === null || val === undefined) return '';
  // convert Date to readable string
  if (val instanceof Date) return val.toISOString();
  return `"${String(val).replace(/"/g, '""')}"`;
}

/*
  NEW: Export projects (single or all)
  Route: GET /projects/export?projectId=<id>
  - If projectId provided: exports that one project
  - If projectId absent: only admin can export all projects
  - Responds with CSV attachment
*/
Router.get('/export', authenticate, async (req, res) => {
  try {
    const { projectId } = req.query;
    const user = req.user;

    let projects = [];

    if (projectId) {
      const project = await Project.findById(projectId).populate('devices');
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }
      // access control: non-admins can only export projects they belong to
      if (user.role !== 'admin' && (!user.projects || !user.projects.map(String).includes(String(project._id)))) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      projects = [project];
    } else {
      // no projectId -> export all projects, only for admin
      if (user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only admins can export all projects' });
      }
      projects = await Project.find().populate('devices');
    }

    // Build CSV
    // We'll create sections per project:
    // Project Overview, then Devices table for that project.
    const lines = [];
    const now = new Date();
    lines.push(['Projects Export']);
    lines.push([`Export Date: ${now.toISOString()}`]);
    lines.push(['']); // blank line

    for (const project of projects) {
      // Project Overview
      lines.push(['Project Overview']);
      lines.push(['Project Name', project.projectName || '']);
      lines.push(['Project Description', project.projectDescription || '']);
      lines.push(['Total Devices', (project.devices && project.devices.length) || 0]);
      lines.push(['']); // blank

      // Devices header
      lines.push(['Devices']);
      // columns: Device _id, Device Name, DeviceId (hw), Status, Date Created, Date Assigned, Project Assigned (yes/no)
      lines.push(['Device DB ID', 'Device Name', 'Device HW ID', 'Status', 'CreatedAt', 'Date Assigned']);

      // If devices were populated, project.devices will be array of documents,
      // otherwise they may be ids (but we used populate above so should be docs)
      const devices = Array.isArray(project.devices) ? project.devices : [];
      for (const dev of devices) {
        // dev might be object or id; handle both
        const deviceDoc = (typeof dev === 'object' && dev !== null) ? dev : await Device.findById(dev).lean().exec();
        const row = [
          deviceDoc ? deviceDoc._id : '',
          deviceDoc ? deviceDoc.name || '' : '',
          deviceDoc ? deviceDoc.deviceId || '' : '',
          deviceDoc ? deviceDoc.status || '' : '',
          deviceDoc ? ((deviceDoc.dateCreated && new Date(deviceDoc.dateCreated).toISOString()) || '') : '',
          deviceDoc ? ((deviceDoc.dateAssigned && new Date(deviceDoc.dateAssigned).toISOString()) || '') : ''
        ];
        lines.push(row);
      }

      lines.push(['']); // blank line between projects
    }

    // Convert lines (array-of-arrays) into CSV text
    const csvText = lines.map(row => row.map(cell => csvCell(cell)).join(',')).join('\n');

    // Send CSV as attachment
    const filename = projectId
      ? `project_${projectId}_export_${now.toISOString().split('T')[0]}.csv`
      : `projects_export_${now.toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvText);
  } catch (err) {
    console.error('Error exporting projects:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


/* --------------------------------------------------------------------------
  The rest of your existing routes (unchanged). Paste them below (or keep your file's other routes above).
  I will copy the routes you provided earlier here (POST /, GET /, GET /:id, PUT /:id, DELETE /:id).
-------------------------------------------------------------------------- */

// Create a new project
Router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { projectName, projectDescription, devices } = req.body;
    // Validate devices are not already assigned
    if (devices && devices.length > 0) {
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
    }
    
    // Assign devices to this project
    if (devices && devices.length > 0) {
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
    await Device.updateMany(
      { project: project._id },
      { project: null, dateAssigned: null }
    );
    
    // Remove project assignment from all users assigned to this project
    await User.updateMany(
      { projects: project._id },
      { $pull: { projects: project._id } }
    );
    
    // Handle status management entries that might be affected
    const projectDevices = await Device.find({ project: project._1d }).select('deviceId');
    const projectDeviceIds = projectDevices.map(d => d.deviceId);
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
    }
    
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = Router;
