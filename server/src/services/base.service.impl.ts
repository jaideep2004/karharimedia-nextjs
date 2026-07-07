import { Document } from 'mongoose';
import { PaginationParams, PaginatedResponse } from '../types/common';
import { IBaseService } from './base.service';
import { BaseRepository } from '../repositories/base.repository';

export abstract class BaseService<T extends Document> implements IBaseService<T> {
  constructor(protected repository: BaseRepository<T>) {}

  async findById(id: string, populate: string[] = []): Promise<T | null> {
    return this.repository.findById(id, populate);
  }

  async findOne(
    conditions: Record<string, any> = {},
    options: Record<string, any> = {},
    populate: string[] = []
  ): Promise<T | null> {
    return this.repository.findOne(conditions, options, populate);
  }

  async find(
    conditions: Record<string, any> = {},
    options: Record<string, any> = {},
    populate: string[] = []
  ): Promise<T[]> {
    return this.repository.find(conditions, options, populate);
  }

  async paginate(
    conditions: Record<string, any> = {},
    pagination: PaginationParams = { page: 1, limit: 10 },
    sort: Record<string, 1 | -1> = { createdAt: -1 },
    populate: string[] = []
  ): Promise<PaginatedResponse<T>> {
    return this.repository.paginate(conditions, pagination, sort, populate);
  }

  async create(data: Partial<T>): Promise<T> {
    return this.repository.create(data);
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    return this.repository.update(id, { $set: data });
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  async softDelete(id: string): Promise<boolean> {
    return this.repository.softDelete(id);
  }

  async count(conditions: Record<string, any> = {}): Promise<number> {
    return this.repository.count(conditions);
  }

  async exists(conditions: Record<string, any>): Promise<boolean> {
    return this.repository.exists(conditions);
  }
}
