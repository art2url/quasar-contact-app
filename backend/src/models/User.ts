import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  // Stores the user's public key bundle generated on the frontend using crypto.subtle.
  // Plaintext private keys remain solely on the client.
  publicKeyBundle?: any;
  /** stock avatar the user picked in Settings */
  avatarUrl: string;
  /** Flag to indicate if user's encryption keys are missing/lost */
  isKeyMissing: boolean;
  createdAt: Date;
}

const UserSchema: Schema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true }, // New required and unique email field.
  passwordHash: { type: String, required: true },
  publicKeyBundle: { type: Schema.Types.Mixed, default: null },
  avatarUrl: { type: String, default: '' },
  isKeyMissing: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model<IUser>('User', UserSchema);
export default User;
