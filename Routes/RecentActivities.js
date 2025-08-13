const Router = require('express').Router();
const RecentActivity = require('../Models/RecentActivityModel');
const { authenticate } = require('../Middleware/auth');

// Get user's recent activities with pagination
Router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, activityType, includeSystem = 'true' } = req.query;
    const skip = (page - 1) * limit;
    
    console.log('Recent Activities Request:', {
      user: req.user,
      query: req.query,
      userId: req.user.id
    });
    
    // Build query to include both user-specific and system-wide activities
    let query = {};
    
    if (includeSystem === 'true') {
      // Include both user-specific activities and system-wide activities (where userId is the default system user)
      query = {
        $or: [
          { userId: req.user.id },
          { userId: '507f1f77bcf86cd799439011' } // System-wide activities
        ]
      };
    } else {
      // Only user-specific activities
      query = { userId: req.user.id };
    }
    
    // Filter by activity type if provided
    if (activityType) {
      query.activityType = activityType;
    }
    
    console.log('MongoDB query:', JSON.stringify(query, null, 2));
    
    const activities = await RecentActivity.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await RecentActivity.countDocuments(query);
    
    console.log(`Found ${activities.length} activities out of ${total} total`);
    
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
    // Count both user-specific and system-wide unread activities
    const userUnreadCount = await RecentActivity.countDocuments({ 
      userId: req.user.id, 
      isRead: false 
    });
    const systemUnreadCount = await RecentActivity.countDocuments({ 
      userId: '507f1f77bcf86cd799439011', 
      isRead: false 
    });
    
    res.status(200).json({ unreadCount: userUnreadCount + systemUnreadCount });
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
    
    // Mark activities as read for both user-specific and system-wide activities
    await RecentActivity.updateMany(
      { 
        _id: { $in: activityIds },
        $or: [
          { userId: req.user.id },
          { userId: '507f1f77bcf86cd799439011' } // System-wide activities
        ]
      },
      { $set: { isRead: true } }
    );
    
    res.status(200).json({ message: 'Activities marked as read successfully' });
  } catch (error) {
    console.error('Error marking activities as read:', error);
    res.status(500).json({ message: 'Failed to mark activities as read', error: error.message });
  }
});

// Clear all activities for user
Router.delete('/clear-all', authenticate, async (req, res) => {
  try {
    // Clear both user-specific and system-wide activities
    await RecentActivity.deleteMany({
      $or: [
        { userId: req.user.id },
        { userId: '507f1f77bcf86cd799439011' } // System-wide activities
      ]
    });
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
      $or: [
        { userId: req.user.id },
        { userId: '507f1f77bcf86cd799439011' } // System-wide activities
      ]
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
      userId: req.user.id,
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