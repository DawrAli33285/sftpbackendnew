const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    s3Key: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
    },
    size: {
      type: Number,
    },
    // Who uploaded — could be a User or Admin, so no strict ref
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:'User',
      required: true,
    },
    // Track whether uploader was admin or user (useful for display)
    uploadedByRole: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    reciever: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

fileSchema.index({ uploadedBy: 1, createdAt: -1 });
fileSchema.index({ reciever: 1, createdAt: -1 });

module.exports = mongoose.model("File", fileSchema);