import UserModel from '../models/user.model';
import type { PipelineStage } from 'mongoose';

type Filter = Record<string, unknown>;

export const UserRepository = {
  findOne(filter: Filter) {
    return UserModel.findOne(filter);
  },

  exists(filter: Filter) {
    return UserModel.exists(filter);
  },

  create(payload: Record<string, unknown>) {
    return UserModel.create(payload);
  },

  findById(id: unknown) {
    return UserModel.findById(id);
  },

  find(filter: Filter = {}) {
    return UserModel.find(filter);
  },

  countDocuments(filter: Filter = {}) {
    return UserModel.countDocuments(filter);
  },

  aggregate(pipeline: PipelineStage[]) {
    return UserModel.aggregate(pipeline);
  },
};

export default UserRepository;
