const Router = require('express').Router();
const RecentActivity = require('../Models/RecentActivityModel');
const { authenticate } = require('../Middleware/auth');

// Get user's recent activities with pagination
Router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, activityType } = req.query;
    const skip = (page - 1) * limit;
    
    let query = { userId: req.user._id };
    
    // Filter by activity type if provided
    if (activityType) {
      query.activityType = activityType;
    }
    
    const activities = await RecentActivity.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await RecentActivity.countDocuments(query);
    
    res.status(200).json({
      activities,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({ message: 'Failed to fetch recent activities', error: error.message });
  }
});

// Get unread count for user
Router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const count = await RecentActivity.getUnreadCount(req.user._id);
    res.status(200).json({ unreadCount: count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ message: 'Failed to fetch unread count', error: error.message });
  }
});

// Mark activities as read
Router.patch('/mark-read', authenticate, async (req, res) => {
  try {
    const { activityIds } = req.body;
    
    if (!activityIds || !Array.isArray(activityIds)) {
      return res.status(400).json({ message: 'Activity IDs array is required' });
    }
    
    await RecentActivity.markAsRead(req.user._id, activityIds);
    
    res.status(200).json({ message: 'Activities marked as read successfully' });
  } catch (error) {
    console.error('Error marking activities as read:', error);
    res.status(500).json({ message: 'Failed to mark activities as read', error: error.message });
  }
});

// Clear all activities for user
Router.delete('/clear-all', authenticate, async (req, res) => {
  try {
    await RecentActivity.clearUserActivities(req.user._id);
    res.status(200).json({ message: 'All activities cleared successfully' });
  } catch (error) {
    console.error('Error clearing activities:', error);
    res.status(500).json({ message: 'Failed to clear activities', error: error.message });
  }
});

// Delete specific activity
Router.delete('/:activityId', authenticate, async (req, res) => {
  try {
    const { activityId } = req.params;
    
    const activity = await RecentActivity.findOneAndDelete({
      _id: activityId,
      userId: req.user._id
    });
    
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }
    
    res.status(200).json({ message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ message: 'Failed to delete activity', error: error.message });
  }
});

// Create a new activity (for internal use by other routes)
Router.post('/create', authenticate, async (req, res) => {
  try {
    const { activityType, title, description, details, severity } = req.body;
    
    if (!activityType || !title || !description) {
      return res.status(400).json({ message: 'Activity type, title, and description are required' });
    }
    
    const activity = new RecentActivity({
      userId: req.user._id,
      activityType,
      title,
      description,
      details: details || {},
      severity: severity || 'info'
    });
    
    await activity.save();
    
    res.status(201).json({ message: 'Activity created successfully', activity });
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ message: 'Failed to create activity', error: error.message });
  }
});

module.exports = Router; 