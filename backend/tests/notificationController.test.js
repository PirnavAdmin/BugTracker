
const { test } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { getNotifications, getUnreadNotificationCount } = require('../controllers/issueController');

// Mock Notification model
const Notification = require('../models/Notification');
const originalFind = Notification.find;
const originalCountDocuments = Notification.countDocuments;

test('getNotifications should return notifications for a user', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const mockNotifications = [
    { _id: new mongoose.Types.ObjectId(), text: 'Test 1', recipientId: userId, createdAt: new Date() },
    { _id: new mongoose.Types.ObjectId(), text: 'Test 2', recipientId: userId, createdAt: new Date() }
  ];

  // Mock Notification.find
  let selectedFields;
  Notification.find = () => ({
    select: (fields) => {
      selectedFields = fields;
      return {
        sort: () => ({
          limit: () => ({
            lean: () => Promise.resolve(mockNotifications)
          })
        })
      };
    }
  });

  const req = {
    user: { _id: userId }
  };
  let responseData;
  const res = {
    status: function(s) { this.statusCode = s; return this; },
    json: function(j) { responseData = j; return this; }
  };

  await getNotifications(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(responseData.length, 2);
  assert.strictEqual(responseData[0].text, 'Test 1');
  assert.ok(responseData[0].id);
  assert.strictEqual(selectedFields, "title text link isRead createdAt");

  // Restore
  Notification.find = originalFind;
});

test('getUnreadNotificationCount should return count for a user', async (t) => {
  const userId = new mongoose.Types.ObjectId();

  // Mock Notification.countDocuments
  Notification.countDocuments = () => Promise.resolve(5);

  const req = {
    user: { _id: userId }
  };
  let responseData;
  const res = {
    status: function(s) { this.statusCode = s; return this; },
    json: function(j) { responseData = j; return this; }
  };

  await getUnreadNotificationCount(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(responseData.count, 5);

  // Restore
  Notification.countDocuments = originalCountDocuments;
});

test('getNotifications should return 401 if user is missing', async (t) => {
  const req = { user: {} };
  let responseData;
  const res = {
    statusCode: 200,
    status: function(s) { this.statusCode = s; return this; },
    json: function(j) { responseData = j; return this; }
  };

  try {
    await getNotifications(req, res);
  } catch (error) {
    // asyncHandler will catch it, but here we call it directly
  }

  assert.strictEqual(res.statusCode, 401);
});
