const mongoose = require('mongoose');

const RecordSchema = new mongoose.Schema({
  picID: { type: String, required: true },
  deviceId: { type: String, required: true },
  previousVersion: { type: String, required: true },
  updatedVersion: { type: String, required: true },
  timestamp: { type: Date, required: true },
  date: { type: Date, default: Date.now }
});

const DashboardStatsSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  stats: {
    date: { type: Date, required: true, default: Date.now },
    records: {
      success: { type: [RecordSchema], default: [] },
      failure: { type: [RecordSchema], default: [] },
      other: { type: [RecordSchema], default: [] }
    }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

// Add compound index for efficient queries
DashboardStatsSchema.index({ deviceId: 1, 'stats.date': 1 });

// Pre-save middleware to ensure proper structure
DashboardStatsSchema.pre('save', function(next) {
  try {
    // Ensure stats object exists
    if (!this.stats) {
      this.stats = {
        date: new Date(),
        records: { success: [], failure: [], other: [] }
      };
    }
    
    // If stats is an array (from old data), convert it to object
    if (Array.isArray(this.stats)) {
      console.log('🔄 Converting array stats to object structure...');
      const firstStats = this.stats[0];
      if (firstStats && firstStats.date) {
        this.stats = {
          date: new Date(firstStats.date),
          records: { success: [], failure: [], other: [] }
        };
      } else {
        this.stats = {
          date: new Date(),
          records: { success: [], failure: [], other: [] }
        };
      }
    }
    
    // Ensure records object exists
    if (!this.stats.records) {
      this.stats.records = { success: [], failure: [], other: [] };
    }
    
    // Ensure arrays exist
    if (!Array.isArray(this.stats.records.success)) {
      this.stats.records.success = [];
    }
    if (!Array.isArray(this.stats.records.failure)) {
      this.stats.records.failure = [];
    }
    if (!Array.isArray(this.stats.records.other)) {
      this.stats.records.other = [];
    }
    
    // Ensure date is set
    if (!this.stats.date) {
      this.stats.date = new Date();
    }
    
    // Ensure date is a Date object
    if (!(this.stats.date instanceof Date)) {
      this.stats.date = new Date(this.stats.date);
    }
    
    next();
  } catch (error) {
    console.error('Error in pre-save middleware:', error);
    next(error);
  }
});

module.exports = mongoose.model('DashboardStats', DashboardStatsSchema);
