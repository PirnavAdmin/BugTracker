const fs = require("fs");
const mongoose = require("mongoose");
const StorageUsage = require("../models/StorageUsage");
const { listS3Objects } = require("../utils/s3");

const sumObjects = (objects) => objects.reduce((total, object) => total + (Number(object.Size) || 0), 0);

const getDiskUsage = () => {
  try {
    const stats = fs.statfsSync(process.cwd());
    const total = Number(stats.blocks) * Number(stats.bsize);
    const available = Number(stats.bavail) * Number(stats.bsize);
    const used = Math.max(total - available, 0);
    return { totalBytes: total, usedBytes: used, availableBytes: available, usagePercent: total ? (used / total) * 100 : null };
  } catch (error) {
    return { totalBytes: null, usedBytes: null, availableBytes: null, usagePercent: null };
  }
};

const getInfrastructureUsage = async () => {
  const mongo = mongoose.connection.readyState === 1 && mongoose.connection.db
    ? await mongoose.connection.db.stats()
    : {};
  const objects = await listS3Objects();
  const customerObjects = objects.filter((object) => /^(issue-attachments|chat-attachments|avatars)\//.test(object.Key || ""));
  const backupObjects = objects.filter((object) => /(^|\/)(backup|backups|mongodb)(\/|[-_])/i.test(object.Key || ""));
  const customerBytes = sumObjects(customerObjects);
  const backupBytes = sumObjects(backupObjects);
  const totalBytes = sumObjects(objects);
  const usageRows = await StorageUsage.aggregate([{ $group: { _id: null, bytes: { $sum: "$totalBytes" } } }]);
  const customerAccountingBytes = usageRows[0]?.bytes || 0;
  return {
    mongodb: {
      dataSize: mongo.dataSize || 0,
      storageSize: mongo.storageSize || 0,
      indexSize: mongo.indexSize || 0,
      totalSize: (mongo.dataSize || 0) + (mongo.indexSize || 0),
      collections: mongo.collections || 0,
      objects: mongo.objects || 0,
    },
    ec2: getDiskUsage(),
    s3: {
      totalBucketBytes: totalBytes,
      customerStorageBytes: customerBytes,
      customerAccountingBytes,
      backupStorageBytes: backupBytes,
      platformSystemStorageBytes: Math.max(totalBytes - customerBytes, 0),
    },
  };
};

module.exports = { getInfrastructureUsage };
