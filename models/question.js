const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    questions: [],
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model("Question", questionSchema);
