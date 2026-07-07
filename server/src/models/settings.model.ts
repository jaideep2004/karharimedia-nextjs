import mongoose, { Document, Schema } from 'mongoose';

export interface ISettings extends Document {
  key: string;
  value: any;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<ISettings>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster lookups
settingsSchema.index({ key: 1 }, { unique: true });

// Pre-save hook to ensure only one document exists per key
settingsSchema.pre('save', async function (next) {
  const existingSetting = await SettingsModel.findOne({ key: this.key });
  if (existingSetting && !existingSetting._id.equals(this._id)) {
    throw new Error(`Setting with key '${this.key}' already exists`);
  }
  next();
});

// Helper method to get a setting by key
settingsSchema.statics.getSetting = async function (key: string, defaultValue: any = null) {
  const setting = await this.findOne({ key });
  return setting ? setting.value : defaultValue;
};

// Helper method to set a setting
settingsSchema.statics.setSetting = async function (key: string, value: any, description?: string) {
  return this.findOneAndUpdate(
    { key },
    { $set: { value, description: description || '' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const SettingsModel = mongoose.model<ISettings>('Settings', settingsSchema);

export default SettingsModel;
