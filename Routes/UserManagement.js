const Router = require('express').Router();
const User = require('../Models/UserModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const Project = require('../Models/ProjectModel');
const { authenticate, requireAdmin } = require('../Middleware/auth');
const ActivityLogger = require('../Services/ActivityLogger');

// Get all users
Router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).select('-password');
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users', error: err.message });
  }
});

// Get specific user by ID
Router.get('/:id', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user', error: err.message });
  }
});

// Add new user
Router.post('/', async (req, res) => {
  try {
    const { name, email, password, role, canAccessFirmware } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashed, role, canAccessFirmware });
    await newUser.save();
    
    // Log activity for user creation
    try {
      // For now, we'll use a default user ID since we don't have user context in this route
      const defaultUserId = '507f1f77bcf86cd799439011'; // Default user ID for system activities
      await ActivityLogger.logUserAdded(
        defaultUserId,
        newUser._id,
        name,
        {
          email,
          role,
          canAccessFirmware,
          createdAt: newUser.createdAt
        }
      );
    } catch (activityError) {
      console.error('Error logging activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    res.status(201).json({ message: 'User created', user: { _id: newUser._id, name, email, role, canAccessFirmware: newUser.canAccessFirmware, createdAt: newUser.createdAt } });
  } catch (err) {
    res.status(500).json({ message: 'Error adding user', error: err.message }); 
  }
});

// Edit user
Router.put('/:id', async (req, res) => {
  try {
    const { name, email, password, role, canAccessFirmware } = req.body;
    const update = { name, email, role };
    if (canAccessFirmware !== undefined) update.canAccessFirmware = canAccessFirmware;
    if (password) update.password = await bcrypt.hash(password, 10);
    const updated = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).select('-password');
    if (!updated) return res.status(404).json({ message: 'User not found' });
    
    // Log activity for user update
    try {
      // For now, we'll use a default user ID since we don't have user context in this route
      const defaultUserId = '507f1f77bcf86cd799439011'; // Default user ID for system activities
      await ActivityLogger.logUserUpdated(
        defaultUserId,
        updated._id,
        name,
        {
          email,
          role,
          canAccessFirmware: updated.canAccessFirmware,
          updatedAt: updated.updatedAt
        }
      );
    } catch (activityError) {
      console.error('Error logging activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Error updating user', error: err.message });
  }
});

// Delete user
Router.delete('/:id', async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'User not found' });
    
    // Log activity for user deletion
    try {
      // For now, we'll use a default user ID since we don't have user context in this route
      const defaultUserId = '507f1f77bcf86cd799439011'; // Default user ID for system activities
      await ActivityLogger.logUserRemoved(
        defaultUserId,
        deleted._id,
        deleted.name,
        {
          email: deleted.email,
          role: deleted.role,
          deletedAt: new Date(),
          canAccessFirmware: deleted.canAccessFirmware
        }
      );
    } catch (activityError) {
      console.error('Error logging activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    res.status(200).json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting user', error: err.message });
  }
});

// Login user
Router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });
    
    // Log login activity
    try {
      await ActivityLogger.logLogin(user._id, {
        email: user.email,
        role: user.role,
        loginTime: new Date()
      });
    } catch (activityError) {
      console.error('Error logging login activity:', activityError);
      // Don't fail the login if activity logging fails
    }
    
    // Include projects in the JWT payload
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name, email: user.email, projects: user.projects }, JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        projects: user.projects, // include projects in user object for frontend if needed
        canAccessFirmware: user.canAccessFirmware, // <-- add this line
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// Assign projects to a user (admin only)
Router.put('/:id/assign-projects', authenticate, requireAdmin, async (req, res) => {
  try {
    const { projectIds } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { projects: projectIds },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Log project assignment activity
    try {
      await ActivityLogger.logBulkOperation(req.user.id, 'Project Assignment', projectIds.length, {
        targetUserId: user._id,
        targetUserName: user.name,
        projectIds,
        assignedBy: req.user.name
      });
    } catch (activityError) {
      console.error('Error logging project assignment activity:', activityError);
      // Don't fail the main request if activity logging fails
    }
    
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error assigning projects', error: err.message });
  }
});

module.exports = Router; 