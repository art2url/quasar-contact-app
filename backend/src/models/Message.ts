import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  ciphertext: string; // Encrypted payload received from the client (encryption handled on frontend)
  timestamp: Date;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
  avatarUrl?: string;
  editedAt?: Date;
  deleted: boolean;
  deletedAt?: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ciphertext: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }, // added
    read: { type: Boolean, default: false },
    avatarUrl: { type: String, default: null },
    editedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const Message = mongoose.model<IMessage>('Message', MessageSchema);
export default Message;
