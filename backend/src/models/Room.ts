import { Schema, model, Types } from 'mongoose';

const roomSchema = new Schema(
  {
    isDm: { type: Boolean, default: true },
    members: [{ type: Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

export default model('Room', roomSchema);
