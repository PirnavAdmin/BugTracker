const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;
const schema = new Schema({ planId: { type: String, required: true, lowercase: true, unique: true }, currency: { type: String, required: true, enum: ["INR"], default: "INR" }, monthly: { type: Number, default: null }, annual: { type: Number, default: null } }, { timestamps: true, versionKey: false });
module.exports = models.PlatformPricing || model("PlatformPricing", schema);
