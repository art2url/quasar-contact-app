// new
import mongoose, { Schema, Document } from 'mongoose';

export interface IPasswordReset extends Document {
  userId: mongoose.Types.ObjectId;
  email: string;
  token: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

const PasswordResetSchema = new Schema<IPasswordReset>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Index for automatic deletion of expired tokens
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordReset = mongoose.model<IPasswordReset>(
  'PasswordReset',
  PasswordResetSchema,
);
export default PasswordReset;
